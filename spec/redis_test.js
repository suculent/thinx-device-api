let redis = require('redis');

const client = redis.createClient({
    host: "localhost",
    port: 6379,
    password: 'changeme!'
});

client.connect().then(async () => {
    client.on('error', (err) => console.log('Redis Client Error', err));
    client.set('key', 'value');
    let key = await client.get('key');
    console.log(key);
} );

