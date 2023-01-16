const { RTMClient, LogLevel } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');

let bot_token = process.env.SLACK_BOT_TOKEN;

console.log(`Logging in with token '${bot_token}'`);

let rtm = new RTMClient(bot_token, { logLevel: LogLevel.DEBUG });

/*
(async () => {
    // Connect to Slack
    const { self, team } = await rtm.start();
  })();
  */

console.log("✅ [info] Creating Slack WEB client...");

if (rtm === null) {
    console.log("☣️ [error] Slack not initialized, or attachCallback called too soon, no RTM...", this.rtm);
    process.exit(1);
}

rtm.on('message', (data) => {
    console.log(`Message from ${data.user}: ${data.text}`);
    if (typeof (this._socket) !== "undefined" && this._socket !== null) {
        try {
            //this._socket.send(JSON.stringify(data.text));
        } catch (e) {
            console.log("☣️ [error] Attach callback exception: " + e);
        }
    } else {
        console.log("☣️ [error] [messenger] CLIENT_EVENTS forwarder has no websocket");
    }
});

rtm.start().then( () => {
    console.log("✅ [info] Slack RTM started SUCCESSFULLY...");
}).catch(s => {
    console.log("!!! initSlack error", s);
});


rtm.on('ready', (rtmStartData) => {
    console.log("RTM Ready with data: ", rtmStartData);
    
    let web = new WebClient(bot_token, {
        rejectRateLimitedCalls: true
    });
    
    web.conversations.list({ limit: 20 })
    .then((response) => {
        for (var c in response.channels) {
            const conversation = response.channels[c];
            if (conversation.name == app_config.slack.bot_topic) {
                console.log("🔨 [debug] [slack] Conversation found...");
                this.channel = conversation.id;
                this.redis.v4.set("slack-conversation-id", conversation.id);
                return;
            }
        }
        console.log("☣️ [error] [slack:rtm::ready] No Slack conversation ID in channels, taking first from:", response.channels);
        this.channel = response.channels[0].id;
    })
    .catch((error) => {
        // Error :/
        console.log('☣️ [error] [slack:rtm::ready] Conversations list error:');
        console.log(error);
    });

    
});

