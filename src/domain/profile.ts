import { fail, ok, type Result } from './result';

export const ROLES = ['Receptionist', 'Clinician', 'Pharmacist', 'Administrator'] as const;
export type Role = (typeof ROLES)[number];

export interface Profile {
  name: string;
  role: Role;
}

export type ProfileForm = Profile;
export type ProfileField = keyof Profile;

export const NAME_MAX = 60;

export function validateProfile(form: ProfileForm): Result<Profile, ProfileField> {
  const name = form.name.trim().replace(/\s+/g, ' ');
  if (!name) return fail({ name: 'Enter your name.' });
  if (name.length > NAME_MAX) return fail({ name: `Keep your name under ${NAME_MAX} characters.` });
  if (!ROLES.includes(form.role)) return fail({ role: 'Choose a role.' });
  return ok({ name, role: form.role });
}

/** "Wanjiru Kamau" -> "WK". One word gives one letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((w) => w[0].toUpperCase()).join('');
}

/** `time` is HH:MM in EAT. */
export function greeting(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
