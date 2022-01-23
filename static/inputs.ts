export function replaceChild(id: string, child: Element) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error("Could not find parent element");
  }
  while (node.lastChild) {
    node.removeChild(node.lastChild);
  }
  node.appendChild(child);
};

function setAttributes(el: HTMLElement, attrs: Record<string, string|number>) {
  Object.keys(attrs).forEach(key => {
    el.setAttribute(key, ""+attrs[key]);
  });
}

export function range(parent: HTMLElement, {
    description = "",
    value = 0,
    min = 0,
    max = 100,
    step = 1,
    update = undefined
  } : {
    description?: string,
    value?: number,
    min?: number,
    max?: number,
    step?: number,
    update?: (value: string) => any,
  }) {
  const label = document.createElement("label");
  const id = ""+Math.random();
  setAttributes(label, {for: id});
  label.innerText = `${description}${description ? ": " : ""}${value}`;
  const input = document.createElement("input");
  setAttributes(input, {type: "range", id, min, max, step, value})
  input.addEventListener("input", (event: Event) => {
    const el = event.target as HTMLInputElement;
    label.innerText = `${description}${description ? ": " : ""}${el.value}`;
    if (update) {
      update(el.value);
    }
  });
  parent.appendChild(label);
  parent.appendChild(input);
}

export function select(parent: HTMLElement, {description = null, value = "", options = [], update = undefined} : {
  description?: string | null,
  value?: string,
  options?: string[],
  update?: (value: string) => any,
}) {
  const id = ""+Math.random();
  if (description) {
    const label = document.createElement("label");
    setAttributes(label, {for: id});
    label.append(description);
    parent.appendChild(label);
  }
  const select = document.createElement("select");
  setAttributes(select, {id, value});
  options.forEach(d => {
    select.options[select.options.length] = new Option(d, d);
  });
  select.addEventListener("change", (event) => {
    const el = event.target as HTMLSelectElement;
    if (update) {
      update(el.value);
    }
  });
  parent.appendChild(select);
}

export function date(parent: HTMLElement, {description="", value=null, update=undefined} : {
  description?: string,
  value?: string | null
  update?: (value: string) => any,
}) {
  const label = document.createElement("label");
  const id = "" + Math.random();
  setAttributes(label, {for: id});
  label.innerText = description;
  const input = document.createElement("input");
  setAttributes(input, {type: "date", id});
  if (value) {
    setAttributes(input, {value});
  }
  input.addEventListener("input", (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (update) {
      update(el.value);
    }
  });
  parent.appendChild(label);
  parent.appendChild(input);
}
