// Config detection (leader, etc.) will be implemented in a later step.

export async function detectConfig() {
  return {
    leader: '\\',
    mapleader_set: false
  };
}
