"""Read a supervisor-selected process identity on inherited descriptor 3."""
import ctypes as c
import json
import os
import sys


class ProcBsdInfo(c.Structure):
    # macOS SDK sys/proc_info.h, MAXCOMLEN=16.
    _fields_ = [
        ("flags_status_exit", c.c_uint32 * 3),
        ("pid", c.c_uint32), ("ppid", c.c_uint32),
        ("uid", c.c_uint32), ("other_ids", c.c_uint32 * 6),
        ("command", c.c_char * 16), ("name", c.c_char * 32),
        ("file_and_terminal", c.c_uint32 * 5), ("nice", c.c_int32),
        ("start_seconds", c.c_uint64), ("start_microseconds", c.c_uint64),
    ]


def describe(pid):
    proc = c.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    proc.proc_pidinfo.argtypes = [c.c_int, c.c_int, c.c_uint64, c.c_void_p, c.c_int]
    proc.proc_pidinfo.restype = c.c_int
    proc.proc_pidpath.argtypes = [c.c_int, c.c_void_p, c.c_uint32]
    proc.proc_pidpath.restype = c.c_int
    info = ProcBsdInfo()
    size = c.sizeof(info)
    if proc.proc_pidinfo(pid, 3, 0, c.byref(info), size) != size:
        raise RuntimeError("A complete process identity is required.")
    path = c.create_string_buffer(4096)
    if proc.proc_pidpath(pid, path, len(path)) <= 0:
        raise RuntimeError("An executable path is required.")
    return [info.pid, info.ppid, info.uid, info.start_seconds,
            info.start_microseconds, os.fsdecode(path.value)]


if __name__ == "__main__" and len(sys.argv) == 2 and sys.argv[1].isascii() and sys.argv[1].isdigit():
    pid = int(sys.argv[1])
    if not 0 < pid <= 0x7fffffff:
        raise SystemExit(2)
    result = json.dumps(describe(pid), separators=(",", ":")).encode()
    if len(result) > 2048 or os.write(3, result) != len(result):
        raise SystemExit(2)
else:
    raise SystemExit(2)
