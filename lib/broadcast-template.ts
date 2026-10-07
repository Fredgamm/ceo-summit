/**
 * E8-T09 — "Les variables disponibles : {{prénom}}, {{nom}}, {{entreprise}}"
 * (bo-communications.html). Simple substitution, no templating engine needed
 * for 3 flat variables.
 */
export interface BroadcastVariables {
  prenom: string;
  nom: string;
  entreprise: string;
}

const VARIABLE_KEYS: Record<keyof BroadcastVariables, string> = {
  prenom: "prénom",
  nom: "nom",
  entreprise: "entreprise",
};

export function renderBroadcastBody(body: string, vars: BroadcastVariables): string {
  let rendered = body;
  for (const [key, placeholder] of Object.entries(VARIABLE_KEYS)) {
    rendered = rendered.split(`{{${placeholder}}}`).join(vars[key as keyof BroadcastVariables]);
  }
  return rendered;
}
