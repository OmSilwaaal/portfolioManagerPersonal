require('dotenv').config();
const { Redis } = require('@upstash/redis');
const Client = require('@triton-one/yellowstone-grpc').default;

const TATUM_API_KEY = process.env.TATUM_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

// Initialize Upstash Redis client
const redis = new Redis({
  url: UPSTASH_URL,
  token: UPSTASH_TOKEN,
});

const RAYDIUM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfX9PNnF32d84M23m4x'; // Example Pump.fun address, can be updated as needed

async function startGrpcStreamer() {
  if (!TATUM_API_KEY) {
    console.error('[GRPC STREAMER] Missing TATUM_API_KEY in environment variables.');
    return;
  }

  console.log('[GRPC STREAMER] Connecting to Tatum Yellowstone Gateway...');
  
  // Connect to Tatum's Yellowstone gRPC Gateway
  const client = new Client(
    'https://solana-mainnet-grpc.gateway.tatum.io:443',
    TATUM_API_KEY, 
    {
      'x-token': TATUM_API_KEY // Tatum authentication header
    }
  );

  const stream = await client.subscribe();
  
  stream.on('data', async (data) => {
    try {
      if (data.account) {
        const pubkey = data.account.account.pubkey.toString('hex'); // Adjust based on expected data shape
        const slot = data.account.slot;
        
        // Cache account state directly in Upstash Redis
        // Keeping TTL short to avoid bloated Redis cache (e.g. 60 seconds)
        const redisKey = `pool_state:${pubkey}`;
        
        await redis.setex(
          redisKey,
          60, 
          JSON.stringify({
            slot,
            data: data.account.account.data.toString('base64'),
            lamports: data.account.account.lamports,
            owner: data.account.account.owner.toString('hex'),
            timestamp: Date.now()
          })
        );
        
        console.log(`[GRPC RECV] Cached state update to Upstash for account: ${pubkey.substring(0,8)}... (Slot: ${slot})`);
      }
    } catch (err) {
      console.error('[GRPC STREAMER] Error processing data:', err);
    }
  });

  stream.on('error', (error) => {
    console.error('[GRPC STREAMER] Stream error:', error);
  });

  stream.on('end', () => {
    console.log('[GRPC STREAMER] Stream disconnected.');
    // Reconnect logic can go here
  });

  // Construct SubscribeRequest
  const req = {
    accounts: {
      raydiumFilter: {
        account: [],
        owner: [RAYDIUM_V4_PROGRAM_ID, PUMPFUN_PROGRAM_ID],
        filters: [],
      }
    },
    slots: {},
    transactions: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: 1, // CONFIRMED commitment for speed
  };

  await new Promise((resolve, reject) => {
    stream.write(req, (err) => {
      if (err) {
        console.error('[GRPC STREAMER] Failed to send SubscribeRequest', err);
        reject(err);
      } else {
        console.log(`[GRPC STREAMER] Successfully subscribed to ${RAYDIUM_V4_PROGRAM_ID} and Pump.fun accounts!`);
        resolve();
      }
    });
  });
}

module.exports = {
  startGrpcStreamer
};

// To run this standalone for testing:
// if (require.main === module) {
//   startGrpcStreamer().catch(console.error);
// }
