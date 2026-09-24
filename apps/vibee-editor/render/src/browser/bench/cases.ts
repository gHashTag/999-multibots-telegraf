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
    want: 'Опубликовать', // cyrillic-ok: the page said this
    expect: null,
  },
  {
    from: 'hh.ru, 2026-09-23: the role chooser on the sign-in page',
    html: `<button id="seeker">Я ищу работу Профиль соискателя</button> // cyrillic-ok: the page said this
           <button id="employer">Я ищу сотрудников Профиль работодателя</button>`, // cyrillic-ok: the page said this
    want: 'Я ищу работу', // cyrillic-ok: the page said this
    expect: 'seeker',
  },
  {
    from: 'Upwork, 2026-09-23: the data notice covers the sign-in buttons',
    html: `<button id="manage">Manage</button>
           <button id="google">Continue with Google</button>`,
    want: 'Manage',
    expect: 'manage',
  },
  {
    from: 'Reddit, 2026-09-23: the community type row opens a dialog',
    html: `<div id="row" role="button">Тип сообщества Ограниченная</div> // cyrillic-ok: the page said this
           <button id="save">Сохранить</button>`, // cyrillic-ok: the page said this
    want: 'Тип сообщества', // cyrillic-ok: the page said this
    expect: 'row',
  },
  {
    from: 'Apple, 2026-09-22: Continue is a button, continue is also in the text',
    html: `<p id="legal">By continuing you agree to the terms</p>
           <button id="go">Continue</button>`,
    want: 'Continue',
    expect: 'go',
  },
  {
    from: 'X, 2026-09-22: the account chooser offers another account',
    html: `<div id="one" role="button">Dmitrii</div>
           <div id="other" role="button">Использовать другой аккаунт</div>`, // cyrillic-ok: the page said this
    want: 'Использовать другой аккаунт', // cyrillic-ok: the page said this
    expect: 'other',
  },
  {
    from: 'Google, 2026-09-22: the consent screen says Allow and Deny',
    html: `<button id="deny">Deny</button><button id="allow">Allow</button>`,
    want: 'Allow',
    expect: 'allow',
  },
  {
    from: 'LinkedIn, 2026-09-22: the post button in Russian',
    html: `<button id="post">Опубликовать</button><a id="draft" href="#">Сохранить черновик</a>`, // cyrillic-ok: the page said this
    want: 'Опубликовать', // cyrillic-ok: the page said this
    expect: 'post',
  },
  {
    from: 'Any page: a hidden button is not a button',
    html: `<button id="ghost" hidden aria-label="Post"></button>`,
    want: 'Post',
    expect: null,
  },
  {
    from: 'Apple, 2026-09-23: Trust this browser',
    html: `<button id="trust">Trust</button><button id="dont">Don't Trust</button>`,
    want: 'Trust',
    expect: 'trust',
  },
  {
    from: 'TikTok, 2026-09-22: three ways in, one of them Apple',
    html: `<button id="phone">Continue with phone</button>
           <button id="google">Continue with Google</button>
           <button id="apple">Continue with Apple</button>`,
    want: 'Continue with Apple',
    expect: 'apple',
  },
  {
    from: 'X compose, 2026-09-23: the thread button adds another post',
    html: `<div id="box" role="textbox" contenteditable="true" aria-label="Post text"></div>
           <button id="add" aria-label="Add post">+</button>
           <button id="all">Post all</button>`,
    want: 'Post all',
    expect: 'all',
  },
  {
    from: 'X compose, 2026-09-23: the box is named by its own words',
    html: `<div id="box" role="textbox" contenteditable="true" aria-label="What is happening?"></div>
           <button id="post">Post</button>`,
    want: 'What is happening?',
    expect: 'box',
  },
  {
    from: 'hh.ru, 2026-09-23: a link and a button share a word',
    html: `<a id="link" href="/vacancies">Вакансии</a> // cyrillic-ok: the page said this
           <button id="search">Найти</button>`, // cyrillic-ok: the page said this
    want: 'Найти', // cyrillic-ok: the page said this
    expect: 'search',
  },
]
