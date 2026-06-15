# Развёртывание Supabase

## 1. Создание проекта

Создайте проект на https://supabase.com и дождитесь запуска базы данных.
В `SQL Editor` выполните целиком файл `supabase/schema.sql`.

Схема создаёт таблицы, RLS-политики, защищённые RPC-функции и публичный bucket
`course-images`. Клиент не может напрямую записывать оценки или читать ключи
ответов без роли администратора.

## 2. Подключение сайта

Откройте `Project Settings -> API` и вставьте в `index.html`:

```html
<meta name="supabase-url" content="https://PROJECT_REF.supabase.co">
<meta name="supabase-anon-key" content="PUBLIC_ANON_KEY">
```

Используйте только публичный `anon` key. Никогда не вставляйте `service_role`
key в HTML, JavaScript или репозиторий.

В `Authentication -> URL Configuration` укажите адрес опубликованного сайта
как `Site URL` и добавьте его в `Redirect URLs`. Подтверждение email должно
оставаться включённым.

## 3. Первый код приглашения

В `SQL Editor` создайте одноразовый код:

```sql
insert into public.invites(code_hash, remaining)
values (
  encode(extensions.digest(upper('GEO10-ADMIN'), 'sha256'), 'hex'),
  1
);
```

Зарегистрируйтесь на сайте с кодом `GEO10-ADMIN` и подтвердите email.

## 4. Назначение администратора

Выполните SQL, заменив email:

```sql
update public.profiles
set role = 'admin', enrolled = true
where email = 'teacher@example.com';
```

После этого выйдите из аккаунта и войдите снова. При первом входе администратора
начальные темы и закрытые ключи ответов будут сохранены в Supabase.

## 5. Коды для учеников

Для каждого ученика рекомендуется отдельный одноразовый код:

```sql
insert into public.invites(code_hash, remaining)
values (
  encode(extensions.digest(upper('GEO10-ABCD'), 'sha256'), 'hex'),
  1
);
```

Для общего кода измените `remaining`, например на `30`. В базе хранится только
SHA-256 хеш кода.

## 6. Публикация на Vercel

Проект уже содержит `vercel.json` с защитными HTTP-заголовками и
`.vercelignore`, исключающий SQL и служебные файлы из публикации.

Самый простой способ:

1. Загрузите проект в GitHub.
2. На https://vercel.com нажмите `Add New -> Project`.
3. Импортируйте репозиторий.
4. В `Framework Preset` выберите `Other`.
5. Оставьте `Root Directory` равным `./`.
6. Не задавайте Build Command и Output Directory.
7. Нажмите `Deploy`.

После первого деплоя Vercel выдаст адрес вроде:

```text
https://geo10.vercel.app
```

В Supabase откройте `Authentication -> URL Configuration` и укажите:

- `Site URL`: точный production-адрес Vercel;
- `Redirect URLs`: тот же production-адрес;
- дополнительно можно оставить `http://localhost:3000` для локальной проверки.

При изменении production-домена обновите эти значения в Supabase.

## Перенос старых пользователей

Пароли Firebase нельзя экспортировать в открытом виде. Для небольшого проекта
проще выдать новые приглашения и попросить пользователей зарегистрироваться в
Supabase. Старые результаты можно импортировать отдельно после сопоставления
Firebase UID с новыми Supabase UUID.
