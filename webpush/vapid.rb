require 'webpush'

# One-time, on the server
vapid_key = Webpush.generate_key

# Save these in our application server settings
vapid_key.public_key
# => "BC1mp...HQ="

vapid_key.private_key
# => "XhGUr...Kec"
