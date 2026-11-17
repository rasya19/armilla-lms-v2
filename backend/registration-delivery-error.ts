export class RegistrationDeliveryError extends Error {
  constructor(
    readonly statusCode: 409 | 503,
    readonly code: "MASTER_ADMIN_REGISTRATION_CONFLICT" | "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "RegistrationDeliveryError";
  }
}
