const MIN_ADMIN_PASSWORD_LENGTH = 8;

function isValidAdminPassword(password) {
  return typeof password === "string" && password.length >= MIN_ADMIN_PASSWORD_LENGTH;
}

module.exports = { MIN_ADMIN_PASSWORD_LENGTH, isValidAdminPassword };
