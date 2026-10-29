// Creates typed DOM controls and plain-text sections shared by viewer pages.
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(
  text: string,
  action: () => void,
  className = "",
): HTMLButtonElement {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function section(
  title: string,
  content: string | string[],
  ordered = false,
): HTMLElement {
  const node = element("section", "text-section");
  node.append(element("h3", "", title));
  if (Array.isArray(content)) {
    const list = element(ordered ? "ol" : "ul");
    content.forEach((text) => list.append(element("li", "", text)));
    node.append(list);
  } else node.append(element("p", "", content));
  return node;
}
