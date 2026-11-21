"""Resolve the holder's pinned Debian runtime package relationships offline."""

import re
from collections import defaultdict
from functools import cmp_to_key
from itertools import zip_longest


PACKAGE_FIELDS = {
    'Package', 'Version', 'Architecture', 'Filename', 'Size', 'SHA256',
    'Depends', 'Pre-Depends', 'Conflicts', 'Breaks', 'Provides', 'Multi-Arch',
}
RELATION = re.compile(
    r'([a-z0-9][a-z0-9+.-]*)(?::(any|arm64|native))?'
    r'(?:\s*\((<<|<=|=|>=|>>)\s+([^()\s]+)\))?',
)
RUN = re.compile(r'([^0-9]*)([0-9]*)')


def read_package_index(lines, archive):
    """Parse selected Deb822 fields from a separately authenticated Packages index."""
    fields = {}
    previous = None
    for line in lines:
        line = line.rstrip('\n')
        if not line:
            if fields:
                yield dict(fields, archive=archive)
            fields = {}
            previous = None
        elif line[0] in ' \t':
            if previous in PACKAGE_FIELDS:
                fields[previous] += ' ' + line.strip()
        else:
            previous, separator, value = line.partition(':')
            if not separator:
                raise ValueError('Malformed Debian package field.')
            if previous in PACKAGE_FIELDS:
                if previous in fields:
                    raise ValueError('Duplicate Debian package field.')
                fields[previous] = value.lstrip(' \t')
    if fields:
        yield dict(fields, archive=archive)


def _version_parts(version):
    epoch, marker, rest = version.partition(':')
    if marker:
        if not re.fullmatch(r'[0-9]{1,10}', epoch):
            raise ValueError('Invalid Debian epoch.')
    else:
        epoch, rest = '0', version
    upstream, hyphen, revision = rest.rpartition('-')
    if not hyphen:
        upstream, revision = rest, '0'
    if (not re.fullmatch(r'[0-9][A-Za-z0-9.+:~\-]*', upstream)
            or not re.fullmatch(r'[A-Za-z0-9.+~]+', revision)):
        raise ValueError('Invalid Debian version.')
    return int(epoch), upstream, revision


def _order(character):
    if character == '~':
        return -1
    if not character:
        return 0
    return ord(character) if character.isalpha() else ord(character) + 256


def _compare_part(left, right):
    while left or right:
        lead_left, digits_left = RUN.match(left).groups()
        lead_right, digits_right = RUN.match(right).groups()
        for first, second in zip_longest(lead_left, lead_right, fillvalue=''):
            if first != second:
                return _order(first) - _order(second)
        left = left[len(lead_left) + len(digits_left):]
        right = right[len(lead_right) + len(digits_right):]
        first, second = digits_left.lstrip('0'), digits_right.lstrip('0')
        if len(first) != len(second):
            return len(first) - len(second)
        if first != second:
            return 1 if first > second else -1
    return 0


def compare_debian_versions(left, right):
    first, second = _version_parts(left), _version_parts(right)
    return first[0] - second[0] or _compare_part(first[1], second[1]) or _compare_part(first[2], second[2])


def _groups(value):
    if not value:
        return ()
    result = []
    for group in value.split(','):
        alternatives = []
        for atom in group.split('|'):
            match = RELATION.fullmatch(atom.strip())
            if match is None:
                raise ValueError('Unsupported Debian package relationship.')
            alternatives.append(match.groups())
        result.append(tuple(alternatives))
    return tuple(result)


def _satisfies(package, relation):
    name, qualifier, operator, version = relation
    if package['Package'] != name:
        return False
    if qualifier == 'any' and package.get('Multi-Arch') != 'allowed':
        return False
    if operator is None:
        return True
    difference = compare_debian_versions(package['Version'], version)
    return {'<<': difference < 0, '<=': difference <= 0, '=': difference == 0,
            '>=': difference >= 0, '>>': difference > 0}[operator]


def _hard_dependencies(package):
    for field in ('Pre-Depends', 'Depends'):
        yield from _groups(package.get(field, ''))


def _root_matches(package, root):
    filename = f"{root['pool_directory']}/{root['name']}_{root['version']}_{root['architecture']}.deb"
    return (
        package['archive'] == root['archive'] and package['Version'] == root['version']
        and package['Architecture'] == root['architecture'] and package['Filename'] == filename
        and package['SHA256'] == root['sha256'] and package['Size'] == str(root['size_bytes'])
    )


def resolve_holder_dependencies(roots, packages):
    """Select direct native providers for the exact holder roots, or fail closed."""
    by_name = defaultdict(list)
    for package in packages:
        if package.get('Architecture') in ('arm64', 'all'):
            by_name[package['Package']].append(package)
    selected = {}
    pending = []
    for root in sorted(roots, key=lambda item: item['name']):
        name = root['name']
        matches = [package for package in by_name[name] if _root_matches(package, root)]
        if not matches or name in selected or any(match != matches[0] for match in matches):
            raise ValueError(f'Exact signed Debian package root unresolved: {name}.')
        selected[name] = matches[0]
        pending.append(matches[0])
    key = cmp_to_key(lambda first, second: compare_debian_versions(first['Version'], second['Version']))
    while pending:
        package = pending.pop()
        for group in _hard_dependencies(package):
            if any(relation[0] in selected and _satisfies(selected[relation[0]], relation) for relation in group):
                continue
            provider = None
            for relation in group:
                name = relation[0]
                matches = [item for item in by_name[name] if _satisfies(item, relation)]
                if name not in selected and matches:
                    provider = max(matches, key=key)
                    same_version = [item for item in matches if compare_debian_versions(
                        item['Version'], provider['Version'],
                    ) == 0]
                    if any({k: v for k, v in item.items() if k != 'archive'} !=
                           {k: v for k, v in provider.items() if k != 'archive'} for item in same_version):
                        raise ValueError(f'Ambiguous signed Debian package records: {name}.')
                    # Equivalent records in both suites prefer the main archive.
                    provider = min(same_version, key=lambda item: item['archive'])
                    break
            if provider is None:
                names = '|'.join(relation[0] for relation in group)
                raise ValueError(f"Debian dependency unresolved for {package['Package']}: {names}.")
            selected[provider['Package']] = provider
            pending.append(provider)
    provides = defaultdict(list)
    for package in selected.values():
        for group in _groups(package.get('Provides', '')):
            if len(group) != 1 or group[0][1] is not None or group[0][2] not in (None, '='):
                raise ValueError('Unsupported Debian virtual package declaration.')
            name, _, _, version = group[0]
            provides[name].append((package, version))
    for package in selected.values():
        for field in ('Conflicts', 'Breaks'):
            for group in _groups(package.get(field, '')):
                for relation in group:
                    other = selected.get(relation[0])
                    if other is not None and other is not package and _satisfies(other, relation):
                        raise ValueError(f"Debian {field} between {package['Package']} and {other['Package']}.")
                    name, _, operator, _ = relation
                    for other, version in provides[name]:
                        if other is package or (operator is not None and version is None):
                            continue
                        virtual = dict(other, Package=name, Version=version)
                        if _satisfies(virtual, relation):
                            raise ValueError(f"Debian {field} between {package['Package']} and {other['Package']}.")
    return tuple(selected[name] for name in sorted(selected))
