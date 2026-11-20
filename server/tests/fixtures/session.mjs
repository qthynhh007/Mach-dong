// Isolate feature tests from account persistence; auth integration is covered separately.
export const sessionHeaders = {Authorization:`Bearer ${"a".repeat(64)}`,"X-CSRF-Token":"test-csrf"};
export const sessionEnv = {DB:{prepare:()=>({bind:()=>({first:async()=>({user_id:"test-user",csrf_token:"test-csrf"})})})}};
