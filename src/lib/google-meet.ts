import { google } from "googleapis";
import { ApiError } from "../common/api-error.js";
import { config } from "../config/env.js";

export type GoogleMeetSpace = {
    name: string;
    meetingUrl: string;
};

function createMeetClient() {
    if (
        !config.googleMeet.enabled ||
        !config.googleMeet.clientId ||
        !config.googleMeet.clientSecret ||
        !config.googleMeet.refreshToken
    ) {
        throw new ApiError(
            503,
            "GOOGLE_MEET_NOT_CONFIGURED",
            "Google Meet chua duoc cau hinh",
        );
    }

    const auth = new google.auth.OAuth2(
        config.googleMeet.clientId,
        config.googleMeet.clientSecret,
    );
    auth.setCredentials({ refresh_token: config.googleMeet.refreshToken });

    return google.meet({ version: "v2", auth });
}

function getGoogleStatus(error: unknown) {
    if (typeof error !== "object" || error === null) {
        return undefined;
    }

    const candidate = error as {
        code?: number;
        response?: { status?: number };
    };
    return candidate.response?.status ?? candidate.code;
}

function shouldRetry(error: unknown) {
    const status = getGoogleStatus(error);
    return status === 429 || (status !== undefined && status >= 500);
}

function getGoogleErrorMessage(error: unknown) {
    if (typeof error !== "object" || error === null) {
        return "Unknown Google Meet error";
    }

    const candidate = error as {
        message?: string;
        response?: { data?: { error?: { message?: string } } };
    };
    return (
        candidate.response?.data?.error?.message ??
        candidate.message ??
        "Unknown Google Meet error"
    );
}

async function withGoogleRetry<T>(operation: () => Promise<T>) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts || !shouldRetry(error)) {
                throw error;
            }

            await new Promise((resolve) =>
                setTimeout(resolve, 250 * 2 ** (attempt - 1)),
            );
        }
    }

    throw new Error("Unreachable Google Meet retry state");
}

export async function createGoogleMeetSpace(): Promise<GoogleMeetSpace> {
    try {
        const meet = createMeetClient();
        const response = await withGoogleRetry(() =>
            meet.spaces.create({
                requestBody: {
                    config: {
                        accessType: "OPEN",
                        entryPointAccess: "ALL",
                    },
                },
            }),
        );

        const { name, meetingUri } = response.data;
        if (!name || !meetingUri) {
            throw new Error("Google Meet returned an incomplete meeting space");
        }

        return {
            name,
            meetingUrl: meetingUri,
        };
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        console.error("Google Meet space creation failed", {
            status: getGoogleStatus(error),
            reason: getGoogleErrorMessage(error),
        });
        throw new ApiError(
            502,
            "GOOGLE_MEET_CREATE_FAILED",
            "Khong the tao phong Google Meet",
        );
    }
}

export async function limitGoogleMeetSpaceAccess(spaceName: string) {
    try {
        const meet = createMeetClient();
        await withGoogleRetry(() =>
            meet.spaces.patch({
                name: spaceName,
                updateMask: "config.accessType",
                requestBody: {
                    name: spaceName,
                    config: { accessType: "TRUSTED" },
                },
            }),
        );
    } catch (error) {
        console.error("Google Meet space cleanup failed", {
            spaceName,
            status: getGoogleStatus(error),
        });
    }
}

export async function closeGoogleMeetSpace(spaceName: string) {
    const meet = createMeetClient();

    try {
        await withGoogleRetry(() =>
            meet.spaces.endActiveConference({ name: spaceName }),
        );
    } catch (error) {
        const status = getGoogleStatus(error);
        if (status !== 400 && status !== 404) {
            console.error("Google Meet conference ending failed", {
                spaceName,
                status,
            });
            throw new ApiError(
                502,
                "GOOGLE_MEET_CLOSE_FAILED",
                "Khong the ket thuc phong Google Meet",
                getGoogleErrorMessage(error),
            );
        }
    }

    try {
        await withGoogleRetry(() =>
            meet.spaces.patch({
                name: spaceName,
                updateMask: "config.accessType",
                requestBody: {
                    name: spaceName,
                    config: { accessType: "TRUSTED" },
                },
            }),
        );
    } catch (error) {
        console.error("Google Meet space closing failed", {
            spaceName,
            status: getGoogleStatus(error),
        });
        throw new ApiError(
            502,
            "GOOGLE_MEET_CLOSE_FAILED",
            "Khong the khoa phong Google Meet",
            getGoogleErrorMessage(error),
        );
    }
}
