/**
 * Domain rule violations. Plan 6 maps these onto RFC 7807 responses; Plan 5's
 * seed treats any of them as a bug in the seed itself. `code` is stable and
 * machine-readable; the message is for humans.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SubmissionWindowClosedError extends DomainError {
  readonly code = "submission-window-closed";
  constructor(target: string) {
    super(`The submission window for ${target} is closed (FR-14/FR-15).`);
  }
}

export class LockedDayError extends DomainError {
  readonly code = "day-locked";
  constructor(date: string) {
    super(`${date} is Evaluated and locked for the student (FR-20).`);
  }
}

export class AbsentDayConflictError extends DomainError {
  readonly code = "absent-day-conflict";
  constructor(date: string) {
    super(`${date} is marked absent — absent and submitted are contradictory.`);
  }
}

export class EntryConflictError extends DomainError {
  readonly code = "entry-conflict";
  constructor(date: string) {
    super(`${date} already holds entries — it cannot also be marked absent.`);
  }
}

export class WeekendAbsenceError extends DomainError {
  readonly code = "weekend-absence";
  constructor(date: string) {
    super(`${date} is a weekend — there is nothing to be absent from (FR-16).`);
  }
}
