module.exports = (data) => {

  const fields = [
    "trackingEnabled",
    "wellnessEnabled",
    "cameraEnabled",
    "deleteAllowed"
  ];

  const isBooleansValid = fields.every(
    field => typeof data[field] === "boolean"
  );

  const isRetentionValid = typeof data.retention === "string" && data.retention.trim() !== "";

  return isBooleansValid && isRetentionValid;
};