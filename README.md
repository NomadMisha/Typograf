# Типограф

Учебный помощник редактора: локальная проверка орфографии, правила пунктуации и неразрывные пробелы, просмотр и подтверждение правок.

## Публикация на GitHub Pages

Готовая автономная страница — `docs/index.html`. Словарь, JavaScript, стили и лицензии включены в HTML. Файл `docs/.nojekyll` отключает обработку Jekyll. Навигация использует относительные ссылки и работает в подпапке репозитория `Typograf`.

В [настройках Pages](https://github.com/NomadMisha/Typograf/settings/pages) выберите:

1. **Source:** Deploy from a branch.
2. **Branch:** `main`, папка **`/docs`**.
3. Нажмите **Save** и дождитесь завершения публикации.

Адрес сайта: <https://nomadmisha.github.io/Typograf/>.

## Обновление опубликованной версии

После обновления однофайловой версии выполните из корня репозитория (Node.js 20+):

```sh
node work/spell-build/build-pages.mjs
```

Скрипт обновляет только `docs/index.html` и `.nojekyll`. Результат нужно закоммитить и отправить в `main`. Исходники сохраняются в `outputs/typograf-prototype`, однофайловая версия — в `outputs/typograf-single-file-v20`, код сборки — в `work/spell-build`.

## Проверка на статическом хостинге

По умолчанию проверка выполняется в браузере; локальный Node.js-сервис для сайта не нужен. Если пользователь включит онлайн-проверку, страница обращается напрямую к Яндекс.Спеллеру и публичному API LanguageTool. GitHub Pages не запускает `work/typograf-service` и не предоставляет маршруты `/api/spelling` и `/api/grammar`.

Онлайн-проверка зависит от доступности, CORS и ограничений внешних API; при ошибке сервисов сайт показывает предупреждение и локальные правки. Конфиденциальные тексты не следует отправлять во внешние сервисы. Для полноценного сервера и собственного LanguageTool см. [инструкцию локального сервиса](work/typograf-service/README.md).

Регрессионные проверки опубликованного HTML:

```sh
cd work/spell-build
TYPOGRAF_HTML=../../docs/index.html node test-app.mjs
cd ../typograf-service
TYPOGRAF_HTML=../../docs/index.html TYPOGRAF_STATIC=1 node test-frontend-mode.mjs
```
