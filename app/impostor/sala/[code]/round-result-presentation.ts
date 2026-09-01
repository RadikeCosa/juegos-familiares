export type VoteResultLike = {
  playerId: string;
  nickname: string;
  voteCount: number;
};

export type VoteResultsClassification =
  | { kind: "insufficient" }
  | { kind: "unique-top"; player: VoteResultLike }
  | { kind: "tie"; players: VoteResultLike[]; voteCount: number };

function isValidVoteResult(result: VoteResultLike) {
  return (
    typeof result.playerId === "string" &&
    result.playerId.length > 0 &&
    typeof result.nickname === "string" &&
    result.nickname.length > 0 &&
    Number.isInteger(result.voteCount) &&
    result.voteCount > 0
  );
}

export function classifyVoteResults(
  voteResults: VoteResultLike[] | null | undefined,
): VoteResultsClassification {
  if (!voteResults || voteResults.length === 0) {
    return { kind: "insufficient" };
  }

  if (!voteResults.every(isValidVoteResult)) {
    return { kind: "insufficient" };
  }

  const maxVoteCount = Math.max(
    ...voteResults.map((result) => result.voteCount),
  );
  const topResults = voteResults.filter(
    (result) => result.voteCount === maxVoteCount,
  );

  if (topResults.length === 1 && topResults[0]) {
    return { kind: "unique-top", player: topResults[0] };
  }

  return {
    kind: "tie",
    players: topResults,
    voteCount: maxVoteCount,
  };
}
