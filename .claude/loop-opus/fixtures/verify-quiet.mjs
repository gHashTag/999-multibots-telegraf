// A stand-in for verify-landed.mjs, used by every scenario that is NOT about
// section 6. The real one costs a `git fetch origin` per invocation (~6 s) and
// section 6 fires on EVERY run it is not given a working manifest -- so without
// this stub, twenty scenarios would each pay six seconds to produce a warning
// none of them is testing.
//
// THIS DOUBLE ENFORCES NOTHING. It has no manifest, reads no file and compares
// nothing; it only prints the shape a healthy run prints and exits 0. That is
// the point: a fake which reproduced the check would let the section-6
// scenarios pass on the fake's merit instead of the checker's. The two
// scenarios that are about section 6 use the REAL verify-landed.mjs with a
// fixture manifest, and they are what proves this shape is honest.
console.log('проверено следов: 79 из 79')
process.exit(0)
