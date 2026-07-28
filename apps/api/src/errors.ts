const PROBLEM_BASE = "https://irp.bistec.example/problems";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly problemType: string,
    readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(detail = "Authentication required.") {
    super(401, `${PROBLEM_BASE}/unauthorized`, "Authentication required", detail);
  }
}

export class ForbiddenError extends HttpError {
  constructor(detail = "This account has not been registered by an Admin.") {
    super(403, `${PROBLEM_BASE}/not-registered`, "Not a registered user", detail);
  }
}
