function (doc, req) {
  if (doc === null) doc = {};
  if (!doc['_id']) doc._id = req.uuid;
  if (!doc['start_time']) doc.start_time = new Date().getTime();
  var newState = req.body.state;
  doc.state = newState;
  doc.timestamp = new Date().getTime();
  doc.last_update = new Date().toISOString();
  delete doc._revisions;
  return [doc, toJSON(doc)];
}
