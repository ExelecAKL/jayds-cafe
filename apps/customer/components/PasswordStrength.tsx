import { passwordStrength } from "../utils/passwordStrength";
export default function PasswordStrength({ password }: { password: string }) {
  const level = passwordStrength(password);
  if (!level) return null;
  const label = ["", "Weak", "Medium", "Strong"][level];
  return (
    <div className="password-strength" data-level={level}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={level}
        aria-valuetext={label}
        className="password-strength-bars"
      >
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={bar <= level ? "is-filled" : ""} />
        ))}
      </div>
      <p className="password-strength-label">{label}</p>
    </div>
  );
}
