export class ApiError extends Error {
    status;
    project;
    constructor(message, status, project) {
        super(message);
        this.status = status;
        this.project = project;
    }
}
async function request(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...options.headers,
        },
    });
    if (response.status === 204)
        return undefined;
    const body = (await response.json());
    if (!response.ok) {
        throw new ApiError(body.error ?? `Request failed with status ${response.status}.`, response.status, body.project);
    }
    return body;
}
export const api = {
    getSession: () => request("/api/session"),
    signIn: (input) => request("/api/session", {
        method: "POST",
        body: JSON.stringify(input),
    }),
    signOut: () => request("/api/session", { method: "DELETE" }),
    listProjects: () => request("/api/projects"),
    createProject: (input) => request("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
    }),
    getProject: (projectId) => request(`/api/projects/${projectId}`),
    runStep: (projectId, step, body = {}) => request(`/api/projects/${projectId}/steps/${step}`, {
        method: "POST",
        body: JSON.stringify(body),
    }),
    retryStep: (projectId, step) => request(`/api/projects/${projectId}/steps/${step}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
    }),
};
export function assetUrl(assetPath) {
    return assetPath ? `/api/assets/${assetPath.split("\\").join("/")}` : null;
}
