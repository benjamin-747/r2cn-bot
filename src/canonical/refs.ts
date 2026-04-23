import type { ScmProvider } from "./scm-provider.js";

/**
 * Provider-agnostic repository identity passed from adapters to handlers (docs §3.1).
 */
export type RepoRef = {
    provider: ScmProvider;
    owner: string;
    name: string;
    fullName: string;
    /** Platform repository numeric id used as canonical `repo_id` in backend task APIs. */
    numericId?: number;
};

/**
 * User identity normalized from provider payloads.
 */
export type Actor = {
    login: string;
    displayName?: string;
    /** Stable provider-side user id; kept as string for cross-platform compatibility. */
    platformUserId?: string;
};

/**
 * Issue identity used by handlers and backend task correlation.
 */
export type IssueRef = {
    id: number;
    number: number;
    title: string;
    htmlUrl: string;
};

export type LabelRef = {
    name: string;
};

/**
 * Delivery metadata propagated for logging/tracing across routing and handlers.
 */
export type DeliveryMeta = {
    deliveryId: string;
    receivedAt?: Date;
};
