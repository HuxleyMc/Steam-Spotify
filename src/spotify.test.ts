import { describe, expect, mock, test } from "bun:test";

import { fetchCurrentPlayingTrackWithRefresh } from "./spotify";

describe("fetchCurrentPlayingTrackWithRefresh", () => {
  test("returns idle result for 204 responses", async () => {
    const result = await fetchCurrentPlayingTrackWithRefresh({
      fetchCurrentTrack: async () => new Response(null, { status: 204 }),
      refreshTokenAvailable: () => true,
      refreshAccessToken: async () => {},
      onReauthorizationRequired: () => {},
    });

    expect(result).toEqual({ is_playing: false, item: null });
  });

  test("refreshes once on 401 and still handles 204 after refresh", async () => {
    const refreshSpy = mock(async () => {});
    const fetchSpy = mock(async () => new Response(null, { status: 204 }));
    let fetchCount = 0;

    const result = await fetchCurrentPlayingTrackWithRefresh({
      fetchCurrentTrack: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return new Response("unauthorized", { status: 401 });
        }
        return fetchSpy();
      },
      refreshTokenAvailable: () => true,
      refreshAccessToken: refreshSpy,
      onReauthorizationRequired: () => {},
    });

    expect(result).toEqual({ is_playing: false, item: null });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("returns parsed payload for successful JSON response", async () => {
    const result = await fetchCurrentPlayingTrackWithRefresh({
      fetchCurrentTrack: async () =>
        new Response(
          JSON.stringify({
            is_playing: true,
            item: { id: "abc", name: "Song" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        ),
      refreshTokenAvailable: () => true,
      refreshAccessToken: async () => {},
      onReauthorizationRequired: () => {},
    });

    expect(result).toEqual({
      is_playing: true,
      item: { id: "abc", name: "Song" },
    });
  });

  test("throws when unauthorized and no refresh token is available", async () => {
    const reauthSpy = mock(() => {});

    await expect(
      fetchCurrentPlayingTrackWithRefresh({
        fetchCurrentTrack: async () =>
          new Response("unauthorized", { status: 401 }),
        refreshTokenAvailable: () => false,
        refreshAccessToken: async () => {},
        onReauthorizationRequired: reauthSpy,
      })
    ).rejects.toThrow("Spotify API request failed (401): unauthorized");

    expect(reauthSpy).toHaveBeenCalledTimes(1);
    expect(reauthSpy).toHaveBeenCalledWith(
      "Spotify access token expired and no refresh token is available."
    );
  });
});
