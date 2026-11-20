/* Inactive filter for the trusted single-threaded temporary-file fixture holder. */
#define _GNU_SOURCE
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

#if !defined(__linux__) || !defined(__aarch64__) || __SIZEOF_LONG__ != 8 || \
    __BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__
#error "This reference filter requires native little-endian Linux ARM64 LP64"
#endif

_Static_assert(AUDIT_ARCH_AARCH64 == 0xc00000b7, "audit architecture");
_Static_assert(SYS_close == 57 && SYS_read == 63 && SYS_exit == 93 && SYS_exit_group == 94, "syscall ABI");
_Static_assert(offsetof(struct seccomp_data, nr) == 0 && offsetof(struct seccomp_data, arch) == 4, "seccomp ABI");
_Static_assert(offsetof(struct seccomp_data, args[0]) == 16 &&
               offsetof(struct seccomp_data, args[2]) == 32, "seccomp argument ABI");
_Static_assert(sizeof(struct sock_filter) == 8 && offsetof(struct sock_filter, k) == 4, "filter ABI");
_Static_assert(SECCOMP_RET_ALLOW == 0x7fff0000 && SECCOMP_RET_KILL_PROCESS == 0x80000000, "seccomp actions");

static struct sock_filter reference_filter[] = {
    {0x20, 0, 0, 4},           /* Load arch. */
    {0x15, 0, 14, 0xc00000b7}, /* Reject any other ABI. */
    {0x20, 0, 0, 0},           /* Load syscall number. */
    {0x15, 11, 0, 57},         /* Close is reduce-only. */
    {0x15, 10, 0, 93},         /* Exit the calling task. */
    {0x15, 9, 0, 94},          /* Exit the group. */
    {0x15, 0, 9, 63},          /* Only read remains eligible. */
    {0x20, 0, 0, 16},          /* Descriptor low word. */
    {0x15, 0, 7, 3},           /* Only the enrolled control descriptor. */
    {0x20, 0, 0, 20},          /* Descriptor high word. */
    {0x15, 0, 5, 0},
    {0x20, 0, 0, 32},          /* Length low word. */
    {0x15, 0, 3, 1},           /* One control byte per read. */
    {0x20, 0, 0, 36},          /* Length high word. */
    {0x15, 0, 1, 0},
    {0x06, 0, 0, SECCOMP_RET_ALLOW},
    {0x06, 0, 0, SECCOMP_RET_KILL_PROCESS},
};

/* Only an enrolled native holder may enter here after exclusive fixture setup. */
void dosai_install_temp_file_reference_filter(void)
{
    const struct sock_fprog program = {
        .len = sizeof(reference_filter) / sizeof(reference_filter[0]),
        .filter = reference_filter,
    };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1UL, 0UL, 0UL, 0UL) != 0 ||
        syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, SECCOMP_FILTER_FLAG_TSYNC, &program) != 0) {
        _exit(125);
    }
}
