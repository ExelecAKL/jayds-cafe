export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  const variety = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d\s]/u].filter(
    (pattern) => pattern.test(password),
  ).length;
  if (password.length >= 12 && variety >= 3) return 3;
  if (password.length >= 8 && variety >= 2) return 2;
  return 1;
}
