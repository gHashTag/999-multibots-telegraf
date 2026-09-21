#!/bin/sh
# THE PROFILE LIVES ON A VOLUME, AND THE VOLUME IS THE PERSON'S.
#
# Until 2026-09-21 the pod had no volume at all: Chromium's profile -- every
# login, every cookie -- lived in the container's own filesystem, and every
# redeploy or restart of the pod wiped it. That is "Close is not forget"
# broken by the platform rather than by a button.
#
# A Railway volume is mounted owned by root, and Chromium runs as the
# unprivileged neko user, so a fresh volume would leave the browser unable
# to write its own profile. This runs as root BEFORE supervisord, hands the
# mount to neko, and then becomes supervisord -- the image's own CMD,
# unchanged (m1k1o/neko runtime/Dockerfile).
set -e

PROFILE="/home/neko/.config/chromium"
mkdir -p "$PROFILE"
chown neko:neko /home/neko/.config "$PROFILE"
# Only the top of a large profile needs fixing on a fresh volume; a full
# walk runs when the owner is wrong, not on every start.
if [ "$(stat -c %U "$PROFILE")" != "neko" ] || \
   find "$PROFILE" -maxdepth 2 ! -user neko -print -quit | grep -q .; then
  chown -R neko:neko "$PROFILE"
fi

exec /usr/bin/supervisord -c /etc/neko/supervisord.conf
