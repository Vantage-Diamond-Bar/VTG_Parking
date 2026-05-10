import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import en from '../messages/en.json'
import zh from '../messages/zh.json'
import ko from '../messages/ko.json'

const messages = { en, zh, ko }

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = cookieStore.get('locale')?.value ?? 'en'
  const validLocales = ['en', 'zh', 'ko'] as const
  type Locale = typeof validLocales[number]
  const resolvedLocale: Locale = validLocales.includes(locale as Locale) ? locale as Locale : 'en'

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale],
  }
})
