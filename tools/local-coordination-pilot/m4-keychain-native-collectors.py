"""Inactive Darwin metadata collectors. No command-line entry point or Keychain item operations."""

import ctypes as c
import os
import re


MAC_MINI_2024 = frozenset(('Mac16,10', 'Mac16,11'))
SYSTEM_STORE_PATHS = frozenset((
    b'/Library/Keychains/System.keychain',
    b'/System/Volumes/Data/Library/Keychains/System.keychain',
))
CALLER_SECURITY_SESSION = 0xffffffff
SESSION_IS_ROOT = 0x0001
SESSION_HAS_GRAPHIC_ACCESS = 0x0010
SESSION_HAS_TTY = 0x0020
SESSION_IS_REMOTE = 0x1000
KNOWN_SESSION_ATTRIBUTES = SESSION_IS_ROOT | SESSION_HAS_GRAPHIC_ACCESS | SESSION_HAS_TTY | SESSION_IS_REMOTE
UINT32_MAX = 0xffffffff


def bind(library, name, result, *args):
    function = getattr(library, name)
    function.restype = result
    function.argtypes = args
    return function


class DarwinMetadata:
    """Fixed Apple APIs, with no loading or OS calls until constructed."""

    def __init__(self):
        if os.uname().sysname != 'Darwin':
            raise OSError('Darwin is required.')
        libc = c.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        security = c.CDLL('/System/Library/Frameworks/Security.framework/Security')
        config = c.CDLL('/System/Library/Frameworks/SystemConfiguration.framework/SystemConfiguration')
        foundation = c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
        self.sysctl = bind(libc, 'sysctlbyname', c.c_int, c.c_char_p, c.c_void_p,
                           c.POINTER(c.c_size_t), c.c_void_p, c.c_size_t)
        self.session = bind(security, 'SessionGetInfo', c.c_int32, c.c_uint32,
                            c.POINTER(c.c_uint32), c.POINTER(c.c_uint32))
        self.console_user = bind(config, 'SCDynamicStoreCopyConsoleUser', c.c_void_p, c.c_void_p,
                                 c.POINTER(c.c_uint32), c.POINTER(c.c_uint32))
        self.copy_search_list = bind(security, 'SecKeychainCopySearchList', c.c_int32, c.POINTER(c.c_void_p))
        self.store_path = bind(security, 'SecKeychainGetPath', c.c_int32, c.c_void_p,
                               c.POINTER(c.c_uint32), c.c_void_p)
        self.array_count = bind(foundation, 'CFArrayGetCount', c.c_long, c.c_void_p)
        self.array_value = bind(foundation, 'CFArrayGetValueAtIndex', c.c_void_p, c.c_void_p, c.c_long)
        self.release = bind(foundation, 'CFRelease', None, c.c_void_p)

    def sysctl_text(self, key):
        value = c.create_string_buffer(64)
        length = c.c_size_t(len(value))
        if self.sysctl(key, value, c.byref(length), None, 0) != 0 or not 1 < length.value <= len(value):
            raise OSError('Host metadata unavailable.')
        data = value.raw[:length.value]
        if data[-1] != 0 or b'\x00' in data[:-1]:
            raise ValueError('Invalid host metadata.')
        return data[:-1].decode('ascii')

    def host(self):
        return os.uname().machine, self.sysctl_text(b'hw.model'), self.sysctl_text(b'kern.osversion')

    def login(self):
        session_id = c.c_uint32()
        attributes = c.c_uint32()
        if self.session(CALLER_SECURITY_SESSION, c.byref(session_id), c.byref(attributes)) != 0:
            raise OSError('Login session unavailable.')
        console_uid = c.c_uint32(UINT32_MAX)
        console_name = self.console_user(None, c.byref(console_uid), None)
        if not console_name:
            raise OSError('Console user unavailable.')
        # The returned name is immediately released without examining its content.
        self.release(console_name)
        return os.getuid(), os.geteuid(), console_uid.value, session_id.value, attributes.value

    def system_store_in_search_list(self):
        stores = c.c_void_p()
        if self.copy_search_list(c.byref(stores)) != 0 or not stores.value:
            raise OSError('Search-list metadata unavailable.')
        try:
            count = self.array_count(stores)
            if not 0 <= count <= 32:
                raise ValueError('Unexpected search-list size.')
            system_seen = False
            for index in range(count):
                store = self.array_value(stores, index)
                value = c.create_string_buffer(4096)
                length = c.c_uint32(len(value))
                if not store or self.store_path(store, c.byref(length), value) != 0:
                    raise OSError('Store metadata unavailable.')
                if not 0 < length.value < len(value) or value.raw[length.value] != 0:
                    raise ValueError('Invalid store metadata.')
                path = value.raw[:length.value]
                if not path.startswith(b'/') or b'\x00' in path:
                    raise ValueError('Invalid store metadata.')
                system_seen |= path in SYSTEM_STORE_PATHS
            return system_seen
        finally:
            self.release(stores)


def collect_host(source, expected_model, expected_build):
    if (type(expected_model) is not str or expected_model not in MAC_MINI_2024
            or type(expected_build) is not str or not re.fullmatch(r'[0-9]{2}[A-Z][0-9]{1,6}[a-z]?', expected_build)):
        return 'REVIEWED_HOST_REQUIRED'
    try:
        return 'MATCHED' if source.host() == ('arm64', expected_model, expected_build) else 'MISMATCHED'
    except (OSError, ValueError):
        return 'UNAVAILABLE'


def collect_login(source, expected_uid, expected_session):
    if (type(expected_uid) is not int or type(expected_session) is not int
            or not 0 < expected_uid < UINT32_MAX or not 0 < expected_session < UINT32_MAX - 1):
        return 'REVIEWED_LOGIN_REQUIRED'
    try:
        real, effective, console, session, attributes = source.login()
    except (OSError, ValueError):
        return 'UNAVAILABLE'
    matches_identity = (real, effective, console, session) == (expected_uid, expected_uid, expected_uid, expected_session)
    if type(attributes) is not int or attributes & ~KNOWN_SESSION_ATTRIBUTES:
        return 'UNAVAILABLE'
    graphical = bool(attributes & SESSION_HAS_GRAPHIC_ACCESS)
    prohibited = bool(attributes & (SESSION_IS_ROOT | SESSION_IS_REMOTE))
    return 'MATCHED' if matches_identity and graphical and not prohibited else 'MISMATCHED'


def collect_system_store(source, expected_model, expected_build, expected_uid, expected_session):
    """Check default file-based store metadata only inside the reviewed login."""
    result = {'scope': 'SOURCE_ONLY', 'systemStore': 'UNAVAILABLE',
              'systemCredentialDenialVerified': False, 'hostQualified': False}
    if (collect_host(source, expected_model, expected_build) != 'MATCHED'
            or collect_login(source, expected_uid, expected_session) != 'MATCHED'):
        return result
    try:
        observed = source.system_store_in_search_list()
    except (OSError, ValueError):
        return result
    if type(observed) is bool and collect_login(source, expected_uid, expected_session) == 'MATCHED':
        result['systemStore'] = 'OBSERVED_IN_DEFAULT_SEARCH_LIST' if observed else 'NOT_OBSERVED_IN_DEFAULT_SEARCH_LIST'
    return result
