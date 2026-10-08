---
name: 'link-previews'
description: 'Why a t27.ai link previews with the wrong card in X, Telegram or LinkedIn, and how to keep it from coming back: a #/ route is the home page to a crawler, a card picture under an unchanged address stays cached, and two writers draw on one site. Load on «превью ломается», «не та картинка в превью», «карточка ссылки», «og:image», «главная показывает не то», «в твите карточка блога», «поделиться курсом/уроком/постом», and BEFORE handing anyone a t27.ai link to post.'
---

# Превью ссылок t27.ai: почему ломается и как не сломать снова

## When to Use This Skill

- Владелец прислал скриншот поста, где под ссылкой t27.ai «не та» карточка.
- Нужно дать ссылку на курс, урок или пост, чтобы её выложили в X, Telegram или LinkedIn.
- Правишь `og:image`, картинки карточек, `index.html` сайта, `build-og.py` апекса
  или шаблон, который печатает ссылку на t27.ai (рилс, план, пост агента).

## Quick Diagnosis (08.10.2026, три причины, все встречались)

1. **В ссылке `#/`.** `t27.ai/#/t27-basics` для краулера — это `t27.ai/`:
   всё после `#` на сервер не уходит. Карточка будет главной: «AGI game —
   play, direct, earn». Лечится только адресом: у курса и урока есть
   статическая страница со своей карточкой.
2. **Картинка с тем же адресом.** X и Telegram держат картинку карточки по её
   URL. С 16.09 по 04.10 `og-image.png` на апексе был карточкой блога
   («T27.AI · BLOG / Published here»). Его вернули 04.10, а X показывал старую
   ещё 08.10, потому что адрес не менялся.
3. **Два писателя одного сайта.** t27.ai отдаёт репозиторий
   `gHashTag/ghashtag.github.io` (апекс). Его публикатор каждые 15 минут
   собирает trinity (`apps/website`) и rsync-ом кладёт сборку. После этого
   `regen-blog.py` пишет страницы блога, а `build-og.py` перерисовывает
   картинки `og-*.png`. Второй путь деплоя — `deploy-site.yml` в trinity
   (ручной). Тот, кто перерисует чужую картинку, ломает превью всем.

Проверка без браузера (t27.ai и x.com из облачного контейнера закрыты, 403):
что реально отдаёт сайт, лежит в `main` апекса.

```bash
# у каждой страницы её og:image существует как файл
cd /home/user/ghashtag.github.io && python3 - <<'EOF'
import re,os,glob
for f in glob.glob('**/index.html', recursive=True):
    s=open(f,encoding='utf-8',errors='ignore').read()
    m=re.search(r'property="og:image" content="([^"]+)"',s)
    if m and not os.path.exists(re.sub(r'^https://t27\.ai/','',m.group(1)).split('?')[0]): print('MISSING',f,m.group(1))
EOF
# история картинки главной: кто и когда её перерисовывал
gh api "repos/gHashTag/ghashtag.github.io/commits?path=og-image.png&per_page=10" --jq '.[]|"\(.sha[0:9]) \(.commit.author.date) \(.commit.message|split("\n")[0])"'
```

## Solution Steps

**Какую ссылку давать (единственно правильные адреса):**

| Что                                         | Адрес для поста                                                      |
| ------------------------------------------- | -------------------------------------------------------------------- |
| курс 0 (t27 basics, первый в `courses.t27`) | `https://t27.ai/learn/`                                              |
| любой другой курс                           | `https://t27.ai/learn/<id курса>/` (например `learn/course/` — FPGA) |
| урок любого курса                           | `https://t27.ai/learn/<id урока>/` (id уроков уникальны)             |
| пост блога                                  | `https://t27.ai/blog/<slug>/` (рус. `…/ru/blog/<slug>/`)             |
| главная                                     | `https://t27.ai/`                                                    |

`t27.ai/#/...` в пост не отдавать никогда: ни владельцу, ни агенту, ни в рилс.

**Что уже стоит на страже:**

- **Курс и урок (trinity, PR #1525).** Строка «Link to share, with a preview
  card» стоит под заголовком: адрес `t27.ai/learn/…`, копирование, X, Telegram,
  LinkedIn. Всё собрано из `shareOf`, а не из адресной строки. Сторож —
  `qa/og-preview-contract.mjs`, раздел 5.
- **Картинка главной.** Адрес `og-image.png?v=<sha256[:12]>`, его вписывает
  `scripts/og-image.mjs`. Сторож проверяет, что версия равна хешу картинки.
- **Картинки блога (апекс, PR #41).** `build-og.py` после отрисовки вписывает
  во все страницы `?v=<хеш>` каждой `og-*.png` (`test_build_og.py`). У уроков
  (`learn/*/card.png?v=`) версия была всегда. Сторож `verify-site.sh` ищет
  файл без `?v=` (PR #42).
- **Рилс по карточке урока (`plan-reel.t27` v2).** Адрес урока —
  `LESSON_ROUTE + id + "/"`, то есть `https://t27.ai/learn/<id>/`. Старые
  карточки с `#/course/<id>` читаются как та же страница урока.
- **Блог-десктоп рендера** (`blog-share.ts` `staticArticleUrl`):
  `#/blog/<slug>` → `/blog/<slug>/`.

**Уже выложенный пост с плохой карточкой** не перерисовать: X держит её по
своему кэшу. Нужно выложить заново со статическим адресом. Сам адрес страницы
X кэширует примерно на неделю, поэтому для свежей карточки годится и новый
адрес.

## Common Issues

- **Правка `build-og.py` или адресов карточек — прогнать сторож апекса на
  проштампованном дереве ДО слияния.** 08.10 #41 слили со словами «публикатор
  не прогонялся», и первая же публикация упала: `verify-site.sh` искал файл
  `og-gft.png?v=2581e8f96c10` (8 статических страниц). Сайт не пострадал —
  сторож ничего не пустил, — но публикации встали до #42. Прогон без сети:
  ```bash
  cd /home/user/ghashtag.github.io
  python3 -c "import importlib.util as u;s=u.spec_from_file_location('b','build-og.py');m=u.module_from_spec(s);s.loader.exec_module(m);print(m.stamp_pages(m.card_versions()))"
  ./verify-site.sh --local | grep '✗' | grep -v 'Russian body'   # своих ✗ быть не должно
  git checkout -- '*.html'                                        # вернуть страницы
  ```
  В рабочем дереве апекса есть старые находки (русские тексты, lastmod) —
  в CI их нет: публикатор пересобирает блог до сторожа. Сравнивать с
  прогоном ДО своей правки, а не с нулём.
- **Ждать публикацию циклом — проверять, что ответ не пустой.** `jq '[…]|first|"\(.id) …"'`
  на пустом списке печатает `null null null null`, и `until [ "$out" != null ]`
  выходит сразу: «дождался» того, чего ещё нет. Брать `.[]|select(…)` и
  `head -1`, условие — `[ -n "$out" ]`.

- **«Сделаю из хеш-маршрута путь в адресной строке».** Нельзя: приложение
  trinity грузит данные относительными путями (`fetch('t27/…')`,
  `base: './'`), и под `/learn/` они ломаются.
- **«Перерисую картинку главной в апексе».** Нельзя: она принадлежит trinity.
  Публикатор апекса падает («og-image.png is not trinity's»), если она не
  байт-в-байт trinity.
- **«Пропущу og-image.png при деплое».** Так было в `deploy-site.yml` до
  08.10: новый адрес с версией указал бы на старую картинку.
- **Ссылка без завершающего `/`** (`learn/constants`) — другой адрес. Он может
  не отдать страницу со своей картинкой. Писать с `/`.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране — всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`). Хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки —
долг, а не норма. Как именно, законы и ловушки — только в навыке
`t27-spec-first`: здесь указатель, не копия правила. В этой теме адрес урока
живёт в `specs/automation/plan-reel.t27` (`LESSON_ROUTE`), а пути страниц
курса — в `apps/website/specs/course/*.t27` trinity (`SHARE_PATH`).

## Related Resources

- trinity: `apps/website/src/pages/Course.tsx` (`shareOf`, `CourseShare`),
  `apps/website/scripts/og-image.mjs`, `apps/website/qa/og-preview-contract.mjs`,
  `.github/workflows/deploy-site.yml`.
- апекс: `build-og.py`, `build-blog.py`, `.github/workflows/publish-website.yml`.
- 999: `render/src/agent/blog-share.ts` (`staticArticleUrl`),
  `render/src/agent/plan-reel.ts` (`lessonLink`, `lessonLinkIn`).
- Навыки: `phone-shot` (экран курса на телефоне), `story-reel-gift` (рилс по карточке плана).
