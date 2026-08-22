#!/usr/bin/env node
/**
 * Один пост блога t27.ai → один файл пропсов для TrinityBlogReel.
 *
 *   node scripts/blog-reel.mjs           # список постов
 *   node scripts/blog-reel.mjs 1         # пропсы для поста №1 → /tmp/blog-1.json
 *   node scripts/blog-reel.mjs 1 --all   # то же + команда рендера
 *
 * Числа для гравированных табличек НЕ выдумываются: берутся только те, что
 * реально стоят в заголовке или описании поста. Если чисел нет — табличка
 * несёт факт словами. Пустая табличка лучше выдуманной: весь блог про то,
 * что измерено, и врать на витрине нельзя.
 */
import fs from 'node:fs';

const RSS = 'https://t27.ai/rss.xml';

const strip = s => s.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? strip(m[1]) : '';
};

/** Минуты чтения и рубрики лежат в описании ленты вида «6 min · FPGA · CI». */
function parseItem(block) {
  const title = tag(block, 'title');
  const description = tag(block, 'description');
  const link = tag(block, 'link');
  const pub = tag(block, 'pubDate');
  const date = pub ? new Date(pub).toISOString().slice(0, 10) : '';
  const cats = [...block.matchAll(/<category>([\s\S]*?)<\/category>/g)].map(m => strip(m[1]));
  return { title, description, link, date, tags: cats };
}

/** Кандидаты в таблички: только измеримое из текста поста. */
function plates({ title, description, tags }) {
  const text = `${title}. ${description}`;
  const out = [];
  // кратности и множители: 2.1×, 4-8x
  const mult = text.match(/\d+(?:[.,]\d+)?\s*[×x](?:\s*\/\s*\d+(?:[.,]\d+)?\s*[×x])?/g);
  if (mult) out.push({ label: 'Разница', value: mult.slice(0, 2).join(' / ') });
  // числа со словом-единицей: 30 epochs, eleven days, fifteen rows
  const withUnit = text.match(/\b\d+\s+[a-z]{3,}\b/gi);
  if (withUnit) out.push({ label: 'Замер', value: withUnit[0] });
  // проценты
  const pct = text.match(/\d+(?:[.,]\d+)?\s?%/g);
  if (pct) out.push({ label: 'Доля', value: pct[0] });
  if (tags.length) out.push({ label: 'Рубрика', value: tags.slice(0, 2).join(' · ') });
  // добираем словесной сутью, чтобы не было пусто
  if (out.length < 3) {
    const first = description.split(/(?<=[.:])\s/)[0] || title;
    out.push({ label: 'Суть', value: first.length > 44 ? first.slice(0, 42) + '…' : first });
  }
  return out.slice(0, 3);
}

const fmtDateline = (date, description) => {
  const min = (description.match(/(\d+)\s*min/) || [])[1];
  return min ? `${date} · ${min} min` : date;
};

async function main() {
  const xml = await fetch(RSS).then(r => r.text());
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => parseItem(m[1]));

  const n = process.argv[2] ? Number(process.argv[2]) : null;
  if (!n) {
    console.log(`постов: ${items.length}\n`);
    items.slice(0, 15).forEach((it, i) =>
      console.log(`${String(i + 1).padStart(2)}. ${it.date}  ${it.title}`)
    );
    console.log('\nnode scripts/blog-reel.mjs <номер>');
    return;
  }

  const it = items[n - 1];
  if (!it) throw new Error(`поста №${n} нет, всего ${items.length}`);

  const props = {
    title: it.title,
    subtitle: it.description.length > 190 ? it.description.slice(0, 188) + '…' : it.description,
    dateline: fmtDateline(it.date, it.description),
    tags: it.tags.length ? it.tags.slice(0, 4) : ['Measured'],
    plates: plates(it),
    // Вывод пишется руками под каждый пост: это единственное место, где нужен
    // человек. Пока не переписан — честная заглушка, а не выдуманная мораль.
    lesson: 'Проверено измерением, а не заявлено.',
    invariant: 'measured, not claimed',
    url: 't27.ai/blog',
    year: 'MMXXVI',
    musicVolume: 0.05,
    captions: [],
  };

  const out = `/tmp/blog-${n}.json`;
  fs.writeFileSync(out, JSON.stringify(props, null, 2));
  console.log(`${out}\n\n${it.date}  ${it.title}\nтаблички: ${props.plates.map(p => p.label + '=' + p.value).join(' | ')}`);
  console.log(`\nnpx remotion render src/index.blog.ts TrinityBlogReel out/blog-${n}.mp4 --props=${out}`);
}

main().catch(e => {
  console.error('ОШИБКА:', e.message);
  process.exit(1);
});
