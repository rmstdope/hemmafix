import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient carries the signed authorization request of a connecting app (the page's
// query) through Google login and the approval.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
