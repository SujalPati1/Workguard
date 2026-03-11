module.exports = (data) => {

  const fields = [
    "trackingEnabled",
    "wellnessEnabled",
    "postureEnabled",
    "cameraEnabled",
    "deleteAllowed"
  ];

  return fields.every(
    field => typeof data[field] === "boolean"
  );
};