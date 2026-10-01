import { isValidDate, isValidTime } from './dates';
import { fail, hasErrors, ok, type Errors, type Result } from './result';
import type { Appointment, ApptStatus, AppData, Ctx } from './types';

export interface AppointmentForm {
  patientId: string;
  date: string;
  time: string;
  reason: string;
}

export type AppointmentField = keyof AppointmentForm;

/** The next free queue number for a day: one more than the visits already booked on it. */
export const nextQueueNumber = (appointments: Appointment[], date: string) =>
  appointments.filter((a) => a.date === date).length + 1;

export function bookAppointment(
  data: AppData,
  form: AppointmentForm,
  ctx: Ctx,
): Result<{ data: AppData; appointment: Appointment }, AppointmentField> {
  const errors: Errors<AppointmentField> = {};
  if (!data.patients.some((p) => p.id === form.patientId)) errors.patientId = 'Select a patient.';
  if (!isValidDate(form.date)) errors.date = 'Enter a valid date as YYYY-MM-DD.';
  if (!isValidTime(form.time)) errors.time = 'Enter a valid time as HH:MM, e.g. 09:30.';
  if (!form.reason.trim()) errors.reason = 'Enter the reason for the visit.';
  if (hasErrors(errors)) return fail(errors);

  const appointment: Appointment = {
    id: ctx.newId(),
    patientId: form.patientId,
    date: form.date,
    time: form.time,
    reason: form.reason.trim(),
    status: 'waiting',
    queueNo: nextQueueNumber(data.appointments, form.date),
  };
  return ok({ data: { ...data, appointments: [...data.appointments, appointment] }, appointment });
}

const NEXT_STATUS: Partial<Record<ApptStatus, ApptStatus>> = { waiting: 'consult', consult: 'done' };

/** Moves a patient one step along the queue: waiting, in consultation, seen. */
export function advanceAppointment(
  data: AppData,
  id: string,
): Result<{ data: AppData; appointment: Appointment }> {
  const current = data.appointments.find((a) => a.id === id);
  if (!current) return fail({ _form: 'Appointment not found.' });
  const status = NEXT_STATUS[current.status];
  if (!status) return fail({ _form: 'This patient has already been seen.' });
  const appointment: Appointment = { ...current, status };
  return ok({
    data: { ...data, appointments: data.appointments.map((a) => (a.id === id ? appointment : a)) },
    appointment,
  });
}
