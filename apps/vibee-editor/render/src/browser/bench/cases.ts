/**
 * A SCORE FOR THE ONE MOVE THE AGENT LIVES BY.
 *
 * Every competitor in this space publishes a number (Skyvern cites WebVoyager
 * 85.8%). We had none -- so "the agent got better at pressing buttons" was an
 * opinion, and a change that broke a case nobody remembered would be found by
 * the owner, live, at midnight. This is the cheap honest version: pages
 * written out by hand from the ones we actually met, each with the words the
 * agent is given and the element it must find.
 *
 * It measures find-target and nothing else. That is the move the whole
 * product rests on: every sign-in, every post, every round ends in "press
 * the thing that says this".
 */
export interface BenchCase {
  /** Where this page was met, and when. */
  from: string
  /** The page, as markup. */
  html: string
  /** What the agent is told to press. */
  want: string
  /** The id of the element it must land on, or null when it must find none. */
  expect: string | null
}

export const CASES: BenchCase[] = [
  {
    from: 'X sign-in, 2026-09-22: the button is ordinary, a GIS frame lingers',
    html: `<iframe id="gsi" src="https://accounts.google.com/gsi/button"></iframe>
           <button id="right">Continue with Google</button>`,
    want: 'Continue with Google',
    expect: 'right',
  },
  {
    from: 'LinkedIn sign-in, 2026-09-22: the button IS the frame',
    html: `<iframe id="gsi" src="https://accounts.google.com/gsi/button"></iframe>
           <a id="legal" href="/legal">Google Privacy Policy</a>`,
    want: 'google',
    expect: 'gsi',
  },
  {
    from: "Apple sign-in for TikTok, 2026-09-23: the words are the field's placeholder",
    html: `<input id="mail" type="text" placeholder="Email or Phone Number">
           <button id="go">Continue</button>`,
    want: 'Email or Phone Number',
    expect: 'mail',
  },
  {
    from: 'Apple, 2026-09-23: the password box is named by a label',
    html: `<label id="lab" for="pw">Password</label><input id="pw" type="password">`,
    want: 'password',
    expect: 'pw',
  },
  {
    from: 'Reddit, 2026-09-23: the exact label beats the longer one',
    html: `<button id="long">Save and continue later</button>
           <button id="exact">Save</button>`,
    want: 'save',
    expect: 'exact',
  },
  {
    from: 'X chat, 2026-09-23: "Message" is both a button and a field',
    html: `<button id="compose" aria-label="New message">New message</button>
           <div id="box" role="textbox" contenteditable="true" aria-label="Message"></div>`,
    want: 'Message',
    expect: 'box',
  },
  {
    from: 'Any page: what is not there must not be invented',
    html: `<button id="a">Post</button>`,
    want: 'Опубликовать',
    expect: null,
  },
]
