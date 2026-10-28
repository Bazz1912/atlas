export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase()
}
export function validUsername(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value))
}
export function passwordRules(value: string) {
  return [
    value.length >= 8,
    /[A-Z]/.test(value),
    /[!@#$%^&*()_+\-=\[\]{};'":\\|<>?,./`~]/.test(value),
    /[a-z]/.test(value),
    /[0-9]/.test(value),
  ]
}
// Supabase's strongest built-in policy also requires lowercase and a digit.
export function validPassword(value: string) {
  return passwordRules(value).every(Boolean)
}
export function authMessage(message: string) {
  if (/username|atlas_profiles_username/i.test(message))
    return 'Username non disponibile o non valido. Scegline un altro.'
  if (/already registered|already been registered/i.test(message))
    return 'Email già registrata. Accedi oppure recupera la password.'
  if (/email not confirmed/i.test(message))
    return 'Conferma prima la tua email usando il link ricevuto.'
  if (/invalid login/i.test(message)) return 'Email o password non corrette.'
  if (/fetch|network/i.test(message))
    return 'Connessione non disponibile. Controlla Internet e riprova.'
  if (/password/i.test(message)) return 'Password non accettata. Controlla tutti i requisiti.'
  if (/rate limit|too many/i.test(message)) return 'Troppe richieste. Attendi prima di riprovare.'
  return message
}
