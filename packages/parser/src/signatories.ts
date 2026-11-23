/**
 * The author line of an amendment as one short label: the lead signatory, then
 * "et al." when there are more, and the group it is tabled on behalf of.
 *
 *   ["Nicolas Bay", "Marion Maréchal", …], "ECR"  →  "Nicolas Bay et al. · ECR"
 *
 * The group is the template's own `<AuNomDe>{ECR}`: the file names it, so it is
 * never guessed from the signatories. An amendment signed by individual MEPs
 * with no group line gets the signatory alone. (Deriving a group from several
 * signatories' own groups would need a member→group lookup the ingest does not
 * hold; when it does, it plugs in here.)
 */
export function signatoryLabel(members: string[] | null | undefined, group: string | null | undefined): string | null {
  const names = (members ?? []).map((m) => m.trim()).filter(Boolean);
  const who = names.length === 0 ? null : names.length === 1 ? names[0]! : `${names[0]} et al.`;
  const g = group?.trim() || null;
  return who && g ? `${who} · ${g}` : (who ?? g);
}
