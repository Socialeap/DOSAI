/* Source-only entry for one trusted, single-threaded fixture holder. */
#define _GNU_SOURCE
#include <fcntl.h>
#include <linux/magic.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/vfs.h>
#include <unistd.h>

#if !defined(__linux__) || !defined(__aarch64__) || __SIZEOF_LONG__ != 8 || \
    __BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__
#error "This holder entry requires native little-endian Linux ARM64 LP64"
#endif

enum { CONTROL_FD = 3, ENTRY_PLAN_FD = 6 };

/* Match the pinned bootstrap translation unit's C ABI. */
struct holder_pin {
    uint64_t device;
    uint64_t inode;
};

struct holder_bootstrap_plan {
    unsigned char challenge[32];
    uint64_t pid;
    struct holder_pin directory;
    struct holder_pin control;
    struct holder_pin setup;
};

struct holder_entry_frame {
    unsigned char magic[8];
    struct holder_bootstrap_plan plan;
};

_Static_assert(sizeof(struct holder_pin) == 16, "holder pin ABI");
_Static_assert(sizeof(struct holder_bootstrap_plan) == 88 &&
               offsetof(struct holder_bootstrap_plan, pid) == 32 &&
               offsetof(struct holder_bootstrap_plan, directory) == 40 &&
               offsetof(struct holder_bootstrap_plan, control) == 56 &&
               offsetof(struct holder_bootstrap_plan, setup) == 72, "holder bootstrap ABI");
_Static_assert(sizeof(struct holder_entry_frame) == 96 &&
               offsetof(struct holder_entry_frame, plan) == 8, "holder entry frame ABI");

extern char **environ;
_Noreturn void dosai_bootstrap_temp_file_holder(const struct holder_bootstrap_plan *plan);

static int matches_entry_plan_fd(void)
{
    struct stat entry;
    struct statfs filesystem;
    const int flags = fcntl(ENTRY_PLAN_FD, F_GETFL);
    const int required = F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE;

    if (flags < 0 || (flags & O_PATH) || (flags & O_ACCMODE) != O_RDONLY) {
        return 0;
    }
    const int seals = fcntl(ENTRY_PLAN_FD, F_GET_SEALS);
    return seals >= 0 && (seals & required) == required &&
           fstat(ENTRY_PLAN_FD, &entry) == 0 && S_ISREG(entry.st_mode) && entry.st_nlink == 0 &&
           entry.st_size == (off_t)sizeof(struct holder_entry_frame) &&
           fstatfs(ENTRY_PLAN_FD, &filesystem) == 0 && filesystem.f_type == TMPFS_MAGIC;
}

static int distinct_pins(const struct holder_pin *left, const struct holder_pin *right)
{
    return left->device != right->device || left->inode != right->inode;
}

static int matches_control(const struct holder_pin *pin)
{
    struct stat entry;
    struct statfs filesystem;
    const int flags = fcntl(CONTROL_FD, F_GETFL);
    return flags >= 0 && !(flags & (O_PATH | O_NONBLOCK)) && (flags & O_ACCMODE) == O_RDONLY &&
           fstat(CONTROL_FD, &entry) == 0 && S_ISFIFO(entry.st_mode) &&
           (uint64_t)entry.st_dev == pin->device && (uint64_t)entry.st_ino == pin->inode &&
           fstatfs(CONTROL_FD, &filesystem) == 0 && filesystem.f_type == PIPEFS_MAGIC;
}

int main(int argc, char **argv)
{
    struct holder_entry_frame frame;
    unsigned char trailing, admission;
    if (argc != 1 || argv == NULL || argv[0] == NULL || strcmp(argv[0], "dosai-temp-file-holder") != 0 ||
        environ == NULL || environ[0] != NULL || !matches_entry_plan_fd() ||
        pread(ENTRY_PLAN_FD, &frame, sizeof(frame), 0) != (ssize_t)sizeof(frame) ||
        pread(ENTRY_PLAN_FD, &trailing, 1, sizeof(frame)) != 0 || close(ENTRY_PLAN_FD) != 0 ||
        memcmp(frame.magic, "DOSAIE01", sizeof(frame.magic)) != 0) {
        _exit(124);
    }

    const struct holder_bootstrap_plan *plan = &frame.plan;
    if (plan->pid == 0 || plan->pid != (uint64_t)getpid() || plan->pid != (uint64_t)syscall(SYS_gettid) ||
        plan->directory.inode == 0 || plan->control.inode == 0 || plan->setup.inode == 0 ||
        !distinct_pins(&plan->directory, &plan->control) || !distinct_pins(&plan->directory, &plan->setup) ||
        !distinct_pins(&plan->control, &plan->setup) || !matches_control(&plan->control)) {
        _exit(124);
    }

    /* Only the trusted launcher may send admission after the baseline is accepted. */
    if (read(CONTROL_FD, &admission, 1) != 1 || admission != 'B') {
        _exit(124);
    }
    dosai_bootstrap_temp_file_holder(plan);
}
