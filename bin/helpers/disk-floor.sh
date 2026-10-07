#!/bin/bash
# tri disk-floor -- is there room to work, and if not, what frees it.
#
# WHY A FLOOR OF 15 GiB AND NOT 2. free-disk.sh refuses at 2 GiB, the size of
# one build; by then a Bash call can already fail with ENOSPC before it starts
# (it.69). On 2026-10-03 the disk sat at 8.7 GiB while 46 finished worktrees
# held ~25.6 GB -- nothing warned, because nothing was below 2 GiB yet. The
# warning has to come while there is still room to run the cleanup itself.
#
# WHAT IT POINTS AT. Worktrees are judged in ONE place, `tri worktrees`: by
# commit, keeping unsaved work and every name the tree's own .gitignore lists.
# This prints the command and never removes anything: a doctor reads.
#
# rc 0 room enough, 1 below the floor, 2 the volume cannot be read.
# TRI_DISK_FREE_KIB and TRI_DISK_FLOOR_GIB exist for tests.
set -u
floor_gib="${TRI_DISK_FLOOR_GIB:-15}"
free_kib="${TRI_DISK_FREE_KIB:-$(df -k /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}')}"
# Digits only, at most 15 of them (a petabyte in KiB has 13): no sign, no
# space, no overflow. Base 10 forced below, so "0999" is not octal.
case "$free_kib" in
  '' | *[!0-9]*)
    echo "disk: cannot read free space on /System/Volumes/Data -- unknown is not fine"
    exit 2 ;;
esac
if [ "${#free_kib}" -gt 15 ]; then
  echo "disk: free space '$free_kib' KiB is not a size -- unknown is not fine"
  exit 2
fi
case "$floor_gib" in '' | *[!0-9]*) floor_gib=15 ;; esac
[ "${#floor_gib}" -gt 6 ] && floor_gib=15
free_kib=$((10#$free_kib))
floor_gib=$((10#$floor_gib))
free_gib=$((free_kib / 1048576))
if [ "$free_kib" -lt $((floor_gib * 1048576)) ]; then
  echo "disk: LOW -- ${free_gib} GiB free, floor ${floor_gib} GiB"
  echo "  judge the worktrees:  tri worktrees"
  echo "  remove proven-safe:   tri worktrees --apply   (unsaved work and .gitignore'd files stay)"
  echo "  dead session scratch: tri disk reap"
  exit 1
fi
echo "disk: ${free_gib} GiB free (floor ${floor_gib} GiB)"
exit 0
