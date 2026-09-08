#!/bin/bash
# A COMPILER THAT APPROVES EVERYTHING.
#
# Used by `tri igla floor`. A battery that stays green against this is not
# consulting a compiler at all -- it is reading its own expectations back.
#
# It lives in its own file rather than a heredoc inside bin/tri because the
# heredoc's case arms are indented exactly like tri's own subcommands, and
# `tri igla selfcheck` -- which scans bin/tri for subcommand names -- read them
# as real commands. A scanner broken by the source it scans is the same class of
# defect this whole toolchain keeps finding; no reason to plant another.
case "$1" in
  spec-status) echo "IMPLEMENTED" ;;
  parse)       echo "(ok)" ;;
  *)           echo "tests 1 pass 1 FAIL 0" ;;
esac
exit 0
