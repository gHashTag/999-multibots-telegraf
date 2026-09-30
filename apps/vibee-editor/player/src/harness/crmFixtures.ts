/**
 * WHAT THE CRM LIST IS TOLD, IN THE HARNESS (tri shot crm).
 *
 * The shapes are the ones pages/Crm.test.tsx holds against the mappers in
 * lib/crm.ts; the people are invented, at real length -- a row breaks on
 * "Анна-Мария Ветрова-Соколовская", not on "Ivan". Answered in the page, so
 * the same fixtures serve `tri shot` and a preview pane that cannot route
 * requests. Nothing here is built into the app.
 */

type Row = [
  string,
  string,
  string | null,
  string | null,
  boolean,
  string,
  boolean,
  number,
]

export const CRM_FIXTURES: Record<string, unknown> = {
  crm_overview: {
    ['всего_людей']: 2380, // cyrillic-ok: server keys
    ['платящих']: 327, // cyrillic-ok: server keys
    ['доля_платящих']: '13.7%', // cyrillic-ok: server keys
    ['пришли_за_7_дней']: 41, // cyrillic-ok: server keys
    ['пришли_за_30_дней']: 188, // cyrillic-ok: server keys
  },
  crm_summary: {
    people_with_messages: 412,
    by_stage: { new: 190, written: 96, talking: 58, client: 41, refused: 27 },
  },
  autopilot_status: { on: false, scope: 'chosen', chosen: 3, cap: 30 },
  autopilot_leads: { leads: ['900000101', '900000104'] },
  crm_waiting: {
    total: 3,
    ours: 2,
    due: 0,
    theirs: 1,
    waiting: [
      {
        telegram_id: '900000101',
        name: 'Анна-Мария Ветрова-Соколовская',
        link: 'https://t.me/anna_demo',
        bot: 'b',
        waiting: 'ours',
        days: 2,
        stage: 'talking',
        because: 'ответила, а мы молчим',
        next_why: 'спросила цену свадебного букета и доставку в субботу',
      },
      {
        telegram_id: '900000102',
        name: 'Игорь Лапин',
        link: null,
        bot: 'b',
        waiting: 'ours',
        days: 1,
        stage: 'written',
        because: 'ответил, а мы молчим',
        next_why: '',
      },
      {
        telegram_id: '900000103',
        name: 'Ольга',
        link: null,
        bot: 'b',
        waiting: 'theirs',
        days: 9,
        stage: 'written',
        because: 'написали, ответа нет',
      },
    ],
  },
  crm_hot_leads: {
    ['найдено']: 12, // cyrillic-ok: server keys
    ['показано']: 1, // cyrillic-ok: server keys
    set_aside_touched: 0,
    ['люди']: [], // cyrillic-ok: server keys
  },
  crm_groups: {
    groups: [
      {
        chat_id: '-1001111111111',
        kind: 'group',
        title: 'Клуб покупателей — весна',
        members_count: 40,
        messages: 12,
      },
    ],
  },
  crm_clients: {
    paid_known: true,
    next_offset: 100,
    clients: (
      [
        [
          '900000101',
          'Анна-Мария Ветрова-Соколовская',
          'anna_vetrova_flowers_demo',
          'Флористика и декор интерьеров',
          true,
          'talking',
          true,
          0,
        ],
        [
          '900000102',
          'Игорь Лапин',
          'lapin_igor',
          null,
          false,
          'written',
          false,
          1,
        ],
        [
          '900000104',
          'Светлана Николаевна Кузнецова',
          null,
          'Школа йоги «Утро»',
          true,
          'client',
          true,
          2,
        ],
        ['900000105', 'Дима', 'dimadev', null, false, 'new', false, 40],
        [
          '900000106',
          'Екатерина Смирнова',
          'katya_smm_pro',
          'SMM-агентство',
          false,
          'talking',
          false,
          20,
        ],
        [
          '900000107',
          'Максим Орлов',
          'orlov_m',
          null,
          false,
          'refused',
          false,
          60,
        ],
        ['900000108', 'Алина', null, null, false, 'new', false, 90],
        [
          '900000109',
          'Ростислав Белоусов-Кременецкий',
          'rost_bk',
          'Автосервис на Ленинском',
          true,
          'client',
          true,
          30,
        ],
        [
          '900000110',
          'Юлия Петрова',
          'yulia_p',
          null,
          false,
          'written',
          false,
          15,
        ],
        ['900000111', 'Тимур', 'timur_777', null, false, 'new', false, 45],
        [
          '900000112',
          'Наталья Громова',
          null,
          'Кондитерская «Мёд»',
          false,
          'talking',
          false,
          12,
        ],
        [
          '900000113',
          'Артём Сергеевич Васнецов',
          'vasnetsov_art',
          null,
          false,
          'later',
          false,
          70,
        ],
      ] as Row[]
    ).map(([id, name, username, client, profile, stage, paid, ago]) => ({
      telegram_id: id,
      name,
      username,
      client,
      has_profile: profile,
      has_soul: profile,
      skills: profile ? 2 : 0,
      stage,
      paid,
      last_seen: new Date(Date.now() - ago * 86_400_000).toISOString(),
      duets: paid ? 3 : 0,
      avatar_url: null,
    })),
  },
}

/** Answer every MCP tool call from the fixtures; anything else is refused. */
export function answerCrmToolsInPage() {
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (!url.endsWith('/mcp')) return real(input, init)
    const body = JSON.parse(String(init?.body ?? '{}'))
    const tool: string = body?.params?.name
    const args = body?.params?.arguments ?? {}
    const fixed = CRM_FIXTURES[tool]
    // A search is answered as the server would: only the rows it matches.
    const answer =
      tool === 'crm_clients' && args.query
        ? {
            ...(fixed as object),
            clients: (
              fixed as { clients: Array<Record<string, unknown>> }
            ).clients.filter(c =>
              [c.name, c.username, c.client, c.telegram_id].some(v =>
                String(v ?? '')
                  .toLowerCase()
                  .includes(String(args.query).toLowerCase())
              )
            ),
          }
        : fixed
    const json = answer
      ? { jsonrpc: '2.0', id: body.id, result: { structuredContent: answer } }
      : {
          jsonrpc: '2.0',
          id: body.id,
          error: { message: `harness: no ${tool}` },
        }
    return new Response(JSON.stringify(json), {
      headers: { 'content-type': 'application/json' },
    })
  }
}
