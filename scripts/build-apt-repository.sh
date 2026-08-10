#!/bin/sh

set -efu

umask 022
export LC_ALL=C

program=${0##*/}

usage() {
	cat <<'EOF'
Build a signed graph2agent APT repository without publishing it.

Usage:
  build-apt-repository.sh [options] -- PACKAGE.deb...

Required options:
  --checksums FILE               SHA-256 manifest containing every input .deb
  --checksums-signature FILE     Detached OpenPGP signature over FILE
  --release-keyring FILE         Public key used to verify the manifest signature
  --release-fingerprint HEX      Expected primary release-key fingerprint
  --archive-gnupg-home DIR       External GnuPG home containing the archive secret key
  --archive-fingerprint HEX      Expected primary archive-key fingerprint

Repository options:
  --output DIR                   Output tree (default: public/apt)
  --base-url HTTPS_URL           Repository URL written to graph2agent.sources
                                 (default: https://packages.graph2agent.dev/apt)
  --suite NAME                   Suite and codename (default: stable)
  --component NAME               Component (default: main)
  --architectures "LIST"         Required architectures (default: "amd64 arm64")
  --help                         Show this help

The release signature and every package checksum are verified before the
existing output is replaced. The archive private key is never copied or
exported; only its minimal public certificate is written to the repository.
EOF
}

die() {
	printf '%s: %s\n' "$program" "$*" >&2
	exit 1
}

require_value() {
	[ "$#" -ge 2 ] || die "$1 requires a value"
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

canonical_file() {
	file_dir=$(dirname "$1")
	file_base=$(basename "$1")
	(
		cd "$file_dir" || exit 1
		printf '%s/%s\n' "$(pwd -P)" "$file_base"
	)
}

normalize_fingerprint() {
	printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

validate_fingerprint() {
	fingerprint=$1
	case "$fingerprint" in
		'' | *[!0-9A-F]*) die "fingerprints must contain only hexadecimal characters" ;;
	esac
	fingerprint_length=${#fingerprint}
	[ "$fingerprint_length" -eq 40 ] || [ "$fingerprint_length" -eq 64 ] ||
		die "fingerprints must be complete 40- or 64-character values"
}

validate_name() {
	value=$1
	label=$2
	case "$value" in
		'' | [!a-z0-9]* | *[!a-z0-9._-]*) die "$label contains unsupported characters" ;;
	esac
}

validate_plain_text() {
	value=$1
	label=$2
	case "$value" in
		*'
'* | *''*) die "$label must be a single line" ;;
	esac
}

verify_signature() {
	verify_home=$1
	signature=$2
	content=$3
	expected_fingerprint=$4
	status_file=$5

	if [ "$signature" = "$content" ]; then
		if ! gpg --homedir "$verify_home" --batch --status-fd 1 \
			--verify "$signature" >"$status_file" 2>/dev/null; then
			return 1
		fi
	else
		if ! gpg --homedir "$verify_home" --batch --status-fd 1 \
			--verify "$signature" "$content" >"$status_file" 2>/dev/null; then
			return 1
		fi
	fi

	awk -v expected="$expected_fingerprint" '
		$2 ~ /^(BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG|KEYEXPIRED|KEYREVOKED|SIGEXPIRED)$/ {
			invalid = 1
		}
		$2 == "VALIDSIG" {
			signer = toupper($3)
			primary = toupper($NF)
			hash_algorithm = $10
			strong_hash = hash_algorithm == 8 || hash_algorithm == 9 ||
				hash_algorithm == 10 || hash_algorithm == 11
			if ((signer == expected || primary == expected) && strong_hash) {
				valid = 1
			}
		}
		END { exit(valid && !invalid ? 0 : 1) }
	' "$status_file"
}

manifest_hash_for() {
	wanted=$1
	awk -v wanted="$wanted" '
		NF == 0 || substr($1, 1, 1) == "#" { next }
		{
			filename = $2
			if (substr(filename, 1, 1) == "*") {
				filename = substr(filename, 2)
			}
			if (filename == wanted && length($1) == 64 && $1 !~ /[^0-9A-Fa-f]/) {
				print tolower($1)
			}
		}
	' "$checksums"
}

output=public/apt
base_url=https://packages.graph2agent.dev/apt
suite=stable
component=main
architectures='amd64 arm64'
checksums=
checksums_signature=
release_keyring=
release_fingerprint=
archive_gnupg_home=
archive_fingerprint=

while [ "$#" -gt 0 ]; do
	case "$1" in
		--checksums)
			require_value "$@"
			checksums=$2
			shift 2
			;;
		--checksums-signature)
			require_value "$@"
			checksums_signature=$2
			shift 2
			;;
		--release-keyring)
			require_value "$@"
			release_keyring=$2
			shift 2
			;;
		--release-fingerprint)
			require_value "$@"
			release_fingerprint=$(normalize_fingerprint "$2")
			shift 2
			;;
		--archive-gnupg-home)
			require_value "$@"
			archive_gnupg_home=$2
			shift 2
			;;
		--archive-fingerprint)
			require_value "$@"
			archive_fingerprint=$(normalize_fingerprint "$2")
			shift 2
			;;
		--output)
			require_value "$@"
			output=$2
			shift 2
			;;
		--base-url)
			require_value "$@"
			base_url=$2
			shift 2
			;;
		--suite)
			require_value "$@"
			suite=$2
			shift 2
			;;
		--component)
			require_value "$@"
			component=$2
			shift 2
			;;
		--architectures)
			require_value "$@"
			architectures=$2
			shift 2
			;;
		--help | -h)
			usage
			exit 0
			;;
		--)
			shift
			break
			;;
		*) die "unknown option: $1" ;;
	esac
done

[ -n "$checksums" ] || die "--checksums is required"
[ -n "$checksums_signature" ] || die "--checksums-signature is required"
[ -n "$release_keyring" ] || die "--release-keyring is required"
[ -n "$release_fingerprint" ] || die "--release-fingerprint is required"
[ -n "$archive_gnupg_home" ] || die "--archive-gnupg-home is required"
[ -n "$archive_fingerprint" ] || die "--archive-fingerprint is required"
[ "$#" -gt 0 ] || die "at least one .deb input is required after --"

validate_fingerprint "$release_fingerprint"
validate_fingerprint "$archive_fingerprint"
validate_name "$suite" suite
validate_name "$component" component
validate_plain_text "$base_url" base-url
case "$base_url" in
	https://* ) ;;
	*) die "--base-url must use HTTPS" ;;
esac
case "$base_url" in
	*[[:space:]]*) die "--base-url must not contain whitespace" ;;
esac
base_url=${base_url%/}

[ -n "$architectures" ] || die "--architectures must not be empty"
validate_plain_text "$architectures" architectures
normalized_architectures=
for architecture in $architectures; do
	validate_name "$architecture" architecture
	case " $normalized_architectures " in
		*" $architecture "*) die "duplicate architecture: $architecture" ;;
	esac
	normalized_architectures="$normalized_architectures $architecture"
done
architectures=${normalized_architectures# }

for command_name in gpg dpkg-deb dpkg-scanpackages gzip sha256sum tar awk grep cmp mktemp; do
	require_command "$command_name"
done

for signed_input in "$checksums" "$checksums_signature" "$release_keyring"; do
	[ -f "$signed_input" ] || die "input is not a regular file: $signed_input"
	[ ! -L "$signed_input" ] || die "symbolic-link inputs are not accepted: $signed_input"
done
[ -d "$archive_gnupg_home" ] || die "archive GnuPG home is not a directory"
[ ! -L "$archive_gnupg_home" ] || die "archive GnuPG home must not be a symbolic link"

checksums=$(canonical_file "$checksums")
checksums_signature=$(canonical_file "$checksums_signature")
release_keyring=$(canonical_file "$release_keyring")
archive_gnupg_home=$(
	cd "$archive_gnupg_home"
	pwd -P
)

output_parent=$(dirname "$output")
output_base=$(basename "$output")
case "$output_base" in
	'' | . | .. | /*) die "unsafe output directory: $output" ;;
esac
[ -d "$output_parent" ] || die "output parent does not exist: $output_parent"
[ ! -L "$output_parent" ] || die "output parent must not be a symbolic link"
[ ! -L "$output" ] || die "output must not be a symbolic link"
[ ! -e "$output" ] || [ -d "$output" ] || die "existing output is not a directory: $output"
output_parent=$(
	cd "$output_parent"
	pwd -P
)
output="$output_parent/$output_base"
case "$output" in
	/ | '') die "unsafe output directory" ;;
esac

case "$archive_gnupg_home" in
	"$output" | "$output"/*) die "archive GnuPG home must be outside the output tree" ;;
esac
case "$output" in
	"$archive_gnupg_home" | "$archive_gnupg_home"/*)
		die "output tree must be outside the archive GnuPG home"
		;;
esac

for immutable_input in "$checksums" "$checksums_signature" "$release_keyring"; do
	case "$immutable_input" in
		"$output" | "$output"/*) die "signed inputs must not be stored inside the output tree" ;;
	esac
done

work=$(mktemp -d "$output_parent/.apt-build.XXXXXX") || die "could not create staging directory"
backup=

cleanup() {
	status=$?
	trap - EXIT HUP INT TERM
	if [ -n "$backup" ] && [ -e "$backup" ] && [ ! -e "$output" ]; then
		mv "$backup" "$output" 2>/dev/null || true
	fi
	if [ -d "$work" ]; then
		rm -rf "$work"
	fi
	exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

trusted_checksums=$work/checksums.txt
trusted_checksums_signature=$work/checksums.txt.sig
trusted_release_keyring=$work/release-keyring
cp "$checksums" "$trusted_checksums"
cp "$checksums_signature" "$trusted_checksums_signature"
cp "$release_keyring" "$trusted_release_keyring"
chmod 0600 "$trusted_checksums" "$trusted_checksums_signature" "$trusted_release_keyring"
checksums=$trusted_checksums
checksums_signature=$trusted_checksums_signature
release_keyring=$trusted_release_keyring

release_verify_home=$work/release-verify
archive_verify_home=$work/archive-verify
repository=$work/repository
incoming=$work/incoming
mkdir -m 0700 "$release_verify_home" "$archive_verify_home"
mkdir -p "$repository" "$incoming"

if ! gpg --homedir "$release_verify_home" --batch --quiet \
	--import-options import-minimal --import "$release_keyring" >/dev/null 2>&1; then
	die "could not import the release verification key"
fi
if gpg --homedir "$release_verify_home" --batch --with-colons \
	--list-secret-keys 2>/dev/null | grep -q '^sec:'; then
	die "--release-keyring must not contain private key material"
fi

release_key_listing=$work/release-key.list
if ! gpg --homedir "$release_verify_home" --batch --with-colons --fingerprint \
	--list-keys "$release_fingerprint" >"$release_key_listing" 2>/dev/null; then
	die "release fingerprint is not present in --release-keyring"
fi
actual_release_fingerprint=$(awk -F: '
	$1 == "pub" { public_key = 1; next }
	public_key && $1 == "fpr" { print toupper($10); exit }
' "$release_key_listing")
[ "$actual_release_fingerprint" = "$release_fingerprint" ] ||
	die "release keyring primary fingerprint does not match --release-fingerprint"

if ! verify_signature "$release_verify_home" "$checksums_signature" "$checksums" \
	"$release_fingerprint" "$work/checksums-signature.status"; then
	die "checksum manifest is unsigned or its release signature is invalid"
fi

archive_key_listing=$work/archive-key.list
if ! gpg --homedir "$archive_gnupg_home" --batch --with-colons --fingerprint \
	--list-secret-keys "$archive_fingerprint" >"$archive_key_listing" 2>/dev/null; then
	die "archive secret key is unavailable"
fi
actual_archive_fingerprint=$(awk -F: '
	$1 == "sec" { secret_key = 1; next }
	secret_key && $1 == "fpr" { print toupper($10); exit }
' "$archive_key_listing")
[ "$actual_archive_fingerprint" = "$archive_fingerprint" ] ||
	die "archive primary fingerprint does not match --archive-fingerprint"

archive_public_key=$repository/graph2agent-archive-keyring.asc
if ! gpg --homedir "$archive_gnupg_home" --batch --armor \
	--export-options export-minimal --export "$archive_fingerprint" >"$archive_public_key"; then
	die "could not export the archive public key"
fi
[ -s "$archive_public_key" ] || die "archive public-key export is empty"

seen_names=$work/seen-names
package_records=$work/packages.tsv
: >"$seen_names"
: >"$package_records"
release_version=

for deb_input in "$@"; do
	[ -f "$deb_input" ] || die "package is not a regular file: $deb_input"
	[ ! -L "$deb_input" ] || die "symbolic-link packages are not accepted: $deb_input"
	deb_input=$(canonical_file "$deb_input")
	case "$deb_input" in
		"$output" | "$output"/*) die "packages must not be read from inside the output tree" ;;
	esac

	deb_name=$(basename "$deb_input")
	case "$deb_name" in
		'' | *[!A-Za-z0-9._+~-]*) die "package filename contains unsupported characters: $deb_name" ;;
	esac
	case "$deb_name" in
		*.deb) ;;
		*) die "package does not have a .deb suffix: $deb_name" ;;
	esac
	if grep -F -x "$deb_name" "$seen_names" >/dev/null 2>&1; then
		die "duplicate package filename: $deb_name"
	fi
	printf '%s\n' "$deb_name" >>"$seen_names"

	expected_hashes=$(manifest_hash_for "$deb_name")
	expected_count=$(printf '%s\n' "$expected_hashes" | awk 'NF { count++ } END { print count + 0 }')
	[ "$expected_count" -eq 1 ] ||
		die "signed checksum manifest must contain exactly one SHA-256 entry for $deb_name"
	expected_hash=$(printf '%s\n' "$expected_hashes" | awk 'NF { print; exit }')

	copied_deb=$incoming/$deb_name
	cp "$deb_input" "$copied_deb"
	actual_hash=$(sha256sum "$copied_deb" | awk '{ print tolower($1) }')
	[ "$actual_hash" = "$expected_hash" ] || die "SHA-256 mismatch for $deb_name"

	package_name=$(dpkg-deb --field "$copied_deb" Package 2>/dev/null) ||
		die "could not read Package metadata from $deb_name"
	package_version=$(dpkg-deb --field "$copied_deb" Version 2>/dev/null) ||
		die "could not read Version metadata from $deb_name"
	package_architecture=$(dpkg-deb --field "$copied_deb" Architecture 2>/dev/null) ||
		die "could not read Architecture metadata from $deb_name"

	[ "$package_name" = graph2agent ] || die "$deb_name contains unexpected package: $package_name"
	case "$package_version" in
		'' | *[!0-9A-Za-z.+~_-]*) die "$deb_name contains an unsupported version" ;;
	esac
	case " $architectures " in
		*" $package_architecture "*) ;;
		*) die "$deb_name contains unsupported architecture: $package_architecture" ;;
	esac
	if awk -F '\t' -v architecture="$package_architecture" \
		'$1 == architecture { found = 1 } END { exit(found ? 0 : 1) }' "$package_records"; then
		die "more than one package was supplied for architecture $package_architecture"
	fi
	if [ -z "$release_version" ]; then
		release_version=$package_version
	elif [ "$release_version" != "$package_version" ]; then
		die "all packages must have the same version"
	fi

	data_tar=$work/data-$package_architecture.tar
	listing=$work/data-$package_architecture.list
	verbose_listing=$work/data-$package_architecture.verbose-list
	control_tar=$work/control-$package_architecture.tar
	control_listing=$work/control-$package_architecture.list
	if ! dpkg-deb --ctrl-tarfile "$copied_deb" >"$control_tar" 2>/dev/null; then
		die "could not inspect package control archive: $deb_name"
	fi
	if ! tar -tf "$control_tar" >"$control_listing" 2>/dev/null; then
		die "invalid package control archive: $deb_name"
	fi
	if awk '
		{
			path = $0
			sub(/^\.\//, "", path)
			if (path ~ /^(preinst|postinst|prerm|postrm|config)$/) {
				unsafe = 1
			}
		}
		END { exit(unsafe ? 0 : 1) }
	' "$control_listing"; then
		die "$deb_name contains an unsupported maintainer script"
	fi
	if ! dpkg-deb --fsys-tarfile "$copied_deb" >"$data_tar" 2>/dev/null; then
		die "could not inspect package payload: $deb_name"
	fi
	if ! tar -tf "$data_tar" >"$listing" 2>/dev/null; then
		die "invalid package payload archive: $deb_name"
	fi
	if awk '
		/^\// || /(^|\/)\.\.($|\/)/ { unsafe = 1 }
		END { exit(unsafe ? 0 : 1) }
	' "$listing"; then
		die "package payload contains an unsafe path: $deb_name"
	fi
	if ! tar -tvf "$data_tar" >"$verbose_listing" 2>/dev/null; then
		die "could not inspect package payload modes: $deb_name"
	fi
	if awk '
		substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { unsafe = 1 }
		END { exit(unsafe ? 0 : 1) }
	' "$verbose_listing"; then
		die "$deb_name contains a symbolic link or special payload file"
	fi
	if ! awk '
		($NF == "./usr/bin/graph2agent" || $NF == "usr/bin/graph2agent") &&
			substr($1, 1, 1) == "-" && substr($1, 1, 10) ~ /x/ {
			found = 1
		}
		END { exit(found ? 0 : 1) }
	' "$verbose_listing"; then
		die "$deb_name does not install an executable /usr/bin/graph2agent"
	fi

	pool_dir=$repository/pool/$component/g/graph2agent
	mkdir -p "$pool_dir"
	pool_name=graph2agent_${package_version}_${package_architecture}.deb
	pool_path=$pool_dir/$pool_name
	[ ! -e "$pool_path" ] || die "package output collision: $pool_name"
	mv "$copied_deb" "$pool_path"
	printf '%s\t%s\t%s\n' "$package_architecture" "$package_version" \
		"pool/$component/g/graph2agent/$pool_name" >>"$package_records"
done

for architecture in $architectures; do
	architecture_count=$(awk -F '\t' -v architecture="$architecture" \
		'$1 == architecture { count++ } END { print count + 0 }' "$package_records")
	[ "$architecture_count" -eq 1 ] || die "exactly one $architecture package is required"

	binary_dir=$repository/dists/$suite/$component/binary-$architecture
	mkdir -p "$binary_dir"
	packages_file=$binary_dir/Packages
	if ! (
		cd "$repository"
		dpkg-scanpackages --arch "$architecture" \
			"pool/$component/g/graph2agent" /dev/null
	) >"$packages_file" 2>"$work/dpkg-scanpackages-$architecture.log"; then
		die "dpkg-scanpackages failed for $architecture"
	fi
	package_count=$(grep -c '^Package: graph2agent$' "$packages_file" || true)
	[ "$package_count" -eq 1 ] || die "generated Packages index is incomplete for $architecture"
	indexed_architecture=$(awk '$1 == "Architecture:" { print $2; exit }' "$packages_file")
	[ "$indexed_architecture" = "$architecture" ] || die "Packages architecture mismatch for $architecture"
	indexed_filename=$(awk '$1 == "Filename:" { print $2; exit }' "$packages_file")
	indexed_hash=$(awk '$1 == "SHA256:" { print tolower($2); exit }' "$packages_file")
	expected_filename=$(awk -F '\t' -v architecture="$architecture" \
		'$1 == architecture { print $3; exit }' "$package_records")
	[ "$indexed_filename" = "$expected_filename" ] || die "Packages filename mismatch for $architecture"
	actual_indexed_hash=$(sha256sum "$repository/$indexed_filename" | awk '{ print tolower($1) }')
	[ "$indexed_hash" = "$actual_indexed_hash" ] || die "Packages checksum mismatch for $architecture"
	gzip -9 -n -c "$packages_file" >"$packages_file.gz"
done

release_dir=$repository/dists/$suite
release_file=$release_dir/Release
release_date=$(date -u '+%a, %d %b %Y %H:%M:%S +0000')
{
	printf 'Origin: graph2agent\n'
	printf 'Label: graph2agent\n'
	printf 'Suite: %s\n' "$suite"
	printf 'Codename: %s\n' "$suite"
	printf 'Date: %s\n' "$release_date"
	printf 'Architectures: %s\n' "$architectures"
	printf 'Components: %s\n' "$component"
	printf 'Description: Signed graph2agent packages\n'
	printf 'SHA256:\n'
	for architecture in $architectures; do
		for index_name in Packages Packages.gz; do
			relative_path=$component/binary-$architecture/$index_name
			index_path=$release_dir/$relative_path
			index_hash=$(sha256sum "$index_path" | awk '{ print tolower($1) }')
			index_size=$(wc -c <"$index_path" | tr -d '[:space:]')
			printf ' %s %16s %s\n' "$index_hash" "$index_size" "$relative_path"
		done
	done
} >"$release_file"

if ! gpg --homedir "$archive_gnupg_home" --batch --yes \
	--local-user "$archive_fingerprint" --digest-algo SHA256 --armor \
	--detach-sign --output "$release_dir/Release.gpg" "$release_file"; then
	die "could not create Release.gpg with the archive key"
fi
if ! gpg --homedir "$archive_gnupg_home" --batch --yes \
	--local-user "$archive_fingerprint" --digest-algo SHA256 --armor \
	--clearsign --output "$release_dir/InRelease" "$release_file"; then
	die "could not create InRelease with the archive key"
fi

if ! gpg --homedir "$archive_verify_home" --batch --quiet \
	--import-options import-minimal --import "$archive_public_key" >/dev/null 2>&1; then
	die "could not import the generated archive public key"
fi
if ! verify_signature "$archive_verify_home" "$release_dir/Release.gpg" "$release_file" \
	"$archive_fingerprint" "$work/release-signature.status"; then
	die "generated detached repository signature did not verify"
fi
if ! verify_signature "$archive_verify_home" "$release_dir/InRelease" "$release_dir/InRelease" \
	"$archive_fingerprint" "$work/inrelease-signature.status"; then
	die "generated InRelease signature did not verify"
fi
if ! gpg --homedir "$archive_verify_home" --batch --quiet \
	--output "$work/inrelease-content" --decrypt "$release_dir/InRelease" 2>/dev/null; then
	die "could not extract generated InRelease content"
fi
cmp -s "$release_file" "$work/inrelease-content" ||
	die "generated InRelease content does not match Release"

release_checksums=$work/release-checksums
awk '
	$1 == "SHA256:" { in_sha256 = 1; next }
	in_sha256 && /^ / { print $1 "  " $3; next }
	in_sha256 { exit }
' "$release_file" >"$release_checksums"
if ! (
	cd "$release_dir"
	sha256sum --check "$release_checksums" >/dev/null
); then
	die "generated repository indexes do not match Release"
fi

cat >"$repository/graph2agent.sources" <<EOF
Types: deb
URIs: $base_url
Suites: $suite
Components: $component
Architectures: $architectures
Signed-By: /etc/apt/keyrings/graph2agent-archive-keyring.asc
EOF

find "$repository" -type d -exec chmod 0755 {} +
find "$repository" -type f -exec chmod 0644 {} +

backup=$output.previous.$$
[ ! -e "$backup" ] && [ ! -L "$backup" ] || die "refusing to overwrite stale backup: $backup"
if [ -e "$output" ]; then
	mv "$output" "$backup"
fi
if ! mv "$repository" "$output"; then
	if [ -n "$backup" ] && [ -e "$backup" ]; then
		mv "$backup" "$output" 2>/dev/null || true
	fi
	die "could not atomically install the generated repository"
fi
if [ -e "$backup" ]; then
	rm -rf "$backup"
fi
backup=

printf 'built signed APT repository for graph2agent %s at %s\n' "$release_version" "$output"
