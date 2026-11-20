/* Inactive bootstrap for one enrolled, single-threaded fixture holder. */
#define _GNU_SOURCE
#include <fcntl.h>
#include <limits.h>
#include <linux/close_range.h>
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
#error "This holder requires native little-endian Linux ARM64 LP64"
#endif

enum { CONTROL_FD = 3, DIRECTORY_FD = 4, SETUP_FD = 5, FILE_FD = 0 };

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

struct holder_setup_frame {
    unsigned char magic[8];
    unsigned char challenge[32];
    uint64_t pid;
    struct holder_pin directory;
    struct holder_pin file;
    struct holder_pin control;
    struct holder_pin setup;
};

_Static_assert(sizeof(struct holder_pin) == 16, "pin wire size");
_Static_assert(sizeof(struct holder_setup_frame) == 112 &&
               offsetof(struct holder_setup_frame, directory) == 48, "setup frame ABI");
_Static_assert(sizeof(struct holder_setup_frame) <= PIPE_BUF, "setup frame must be atomic");

void dosai_install_temp_file_reference_filter(void);

static int matches_pin(const struct stat *entry, const struct holder_pin *pin)
{
    return pin->inode != 0 && (uint64_t)entry->st_ino == pin->inode &&
           (uint64_t)entry->st_dev == pin->device;
}

static int matches_pipe(int fd, const struct holder_pin *pin, int access, int nonblocking)
{
    struct stat entry;
    struct statfs filesystem;
    const int flags = fcntl(fd, F_GETFL);
    return flags >= 0 && !(flags & O_PATH) && (flags & O_ACCMODE) == access && !!(flags & O_NONBLOCK) == nonblocking &&
           fstat(fd, &entry) == 0 && S_ISFIFO(entry.st_mode) && matches_pin(&entry, pin) &&
           fstatfs(fd, &filesystem) == 0 && filesystem.f_type == PIPEFS_MAGIC;
}

static int matches_setup(const struct holder_bootstrap_plan *plan, struct stat *directory)
{
    return fstat(DIRECTORY_FD, directory) == 0 && S_ISDIR(directory->st_mode) &&
           (directory->st_mode & 07777) == 0700 && directory->st_uid == geteuid() &&
           matches_pin(directory, &plan->directory) &&
           !(plan->control.device == plan->setup.device && plan->control.inode == plan->setup.inode) &&
           matches_pipe(CONTROL_FD, &plan->control, O_RDONLY, 0) &&
           matches_pipe(SETUP_FD, &plan->setup, O_WRONLY, 1);
}

/* After seccomp, avoid libc paths that can issue extra syscalls. */
static long holder_call(long number, long first, long second, long third)
{
    register long x0 __asm__("x0") = first;
    register long x1 __asm__("x1") = second;
    register long x2 __asm__("x2") = third;
    register long x8 __asm__("x8") = number;
    __asm__ volatile("svc #0" : "+r"(x0) : "r"(x1), "r"(x2), "r"(x8) : "memory", "cc");
    return x0;
}

static _Noreturn void holder_exit(int status)
{
    holder_call(SYS_exit_group, status, 0, 0);
    __builtin_unreachable();
}

/* The trusted caller pins this process and excludes external references before entry. */
_Noreturn void dosai_bootstrap_temp_file_holder(const struct holder_bootstrap_plan *plan)
{
    struct stat directory, file;
    struct holder_setup_frame frame = { .magic = { 'D', 'O', 'S', 'A', 'I', 'T', 'F', '1' } };

    if (plan == NULL || plan->pid == 0 || plan->pid != (uint64_t)getpid() ||
        plan->pid != (uint64_t)syscall(SYS_gettid) || !matches_setup(plan, &directory)) {
        _exit(124);
    }
    if (syscall(SYS_close_range, 6U, UINT_MAX, CLOSE_RANGE_UNSHARE) != 0 ||
        syscall(SYS_close_range, 0U, 2U, 0U) != 0 || !matches_setup(plan, &directory)) {
        _exit(124);
    }
    umask(077);
    const int created = openat(DIRECTORY_FD, "fixture-canary.tmp",
                               O_RDONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (created != FILE_FD || fstat(created, &file) != 0 || !S_ISREG(file.st_mode) ||
        (file.st_mode & 07777) != 0600 || file.st_nlink != 1 || file.st_ino == 0 ||
        file.st_dev != directory.st_dev || close(DIRECTORY_FD) != 0) {
        _exit(124);
    }

    memcpy(frame.challenge, plan->challenge, sizeof(frame.challenge));
    frame.pid = plan->pid;
    frame.directory = plan->directory;
    frame.file = (struct holder_pin){ (uint64_t)file.st_dev, (uint64_t)file.st_ino };
    frame.control = plan->control;
    frame.setup = plan->setup;
    if (write(SETUP_FD, &frame, sizeof(frame)) != (ssize_t)sizeof(frame)) {
        _exit(124);
    }

    dosai_install_temp_file_reference_filter();
    if (holder_call(SYS_close, SETUP_FD, 0, 0) != 0) {
        holder_exit(124);
    }
    unsigned char command = 0;
    if (holder_call(SYS_read, CONTROL_FD, (long)&command, 1) != 1 || command != 'C' ||
        holder_call(SYS_close, FILE_FD, 0, 0) != 0) {
        holder_exit(124);
    }
    /* Stay observable after the close until the enrolled control peer retires. */
    const long result = holder_call(SYS_read, CONTROL_FD, (long)&command, 1);
    holder_exit(result == 0 ? 0 : 124);
}
