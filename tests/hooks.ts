// A small stand-in for React's renderer, so a test can run one component's own code: its state,
// memos, refs, effects and event handlers, with no browser. Child components are not drawn. They
// stay elements in the tree, so a test reads the props the component hands them and calls their
// handlers the way the child would. With a FakeDom, each host element gets a stand-in node, refs
// point at those nodes, and the test can see where keyboard focus is, including focus lost to the
// page when the focused element leaves it.

import * as React from "react";
import { isValidElement, type ReactElement, type ReactNode } from "react";

type Deps = readonly unknown[] | undefined;
type Props = Record<string, unknown>;
export type El = ReactElement<Props>;

interface Internals {
  H: unknown;
}

// React reads the hooks of the component being drawn from here. The harness puts its own there
// while it calls the component, and puts back what was there after.
const INTERNALS = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: Internals })
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const MAX_DRAWS = 50;

function depsChanged(prev: Deps, next: Deps): boolean {
  if (prev === undefined || next === undefined) return true;
  return prev.length !== next.length || prev.some((d, i) => !Object.is(d, next[i]));
}

interface EffectSlot {
  deps: Deps;
  create: () => void | (() => void);
  cleanup?: () => void;
  due: boolean;
}

/** A stand-in for one DOM element, enough to follow keyboard focus. */
export class FakeNode {
  constructor(
    private readonly dom: FakeDom,
    readonly path: string,
    public element: El | null,
  ) {}

  focus(): void {
    this.dom.active = this;
  }

  contains(other: unknown): boolean {
    return other instanceof FakeNode && (other.path === this.path || other.path.startsWith(`${this.path}/`));
  }

  /** Scrolling does nothing here. It is on the node so a page that scrolls to it still runs. */
  scrollIntoView(): void {}
}

/** A stand-in for the page: its body, the element with focus, and a node for each host element drawn. */
export class FakeDom {
  readonly body = new FakeNode(this, "body", null);
  active: FakeNode | null = null;
  private nodes = new Map<string, FakeNode>();
  private refs = new Map<string, { current: unknown }>();

  /**
   * The object to stand in for `document`. It also has the few parts the checker's own effects
   * use, the root element whose language it sets and the listeners it adds, which do nothing here.
   */
  readonly document = ((dom: FakeDom) => ({
    body: dom.body,
    get activeElement(): FakeNode {
      return dom.active ?? dom.body;
    },
    documentElement: { lang: "" },
    visibilityState: "visible",
    addEventListener(): void {},
    removeEventListener(): void {},
  }))(this);

  /** A node somewhere else on the page, outside the component, like a box on another card. */
  outside(name: string): FakeNode {
    return new FakeNode(this, `outside:${name}`, null);
  }

  /** The node drawn for this element, or undefined if it is not on the page. */
  nodeOf(element: El): FakeNode | undefined {
    for (const node of this.nodes.values()) if (node.element === element) return node;
    return undefined;
  }

  /** Matches the nodes to what was just drawn. A node no longer drawn takes focus with it, as in a browser. */
  commit(tree: ReactNode): void {
    const drawn = new Map<string, El>();
    walk(tree, "root", (element, path) => {
      if (typeof element.type === "string") drawn.set(path, element);
    });
    for (const [path, node] of this.nodes) {
      if (drawn.has(path)) continue;
      this.nodes.delete(path);
      const ref = this.refs.get(path);
      if (ref) ref.current = null;
      this.refs.delete(path);
      if (this.active === node) this.active = null;
    }
    for (const [path, element] of drawn) {
      const node = this.nodes.get(path) ?? new FakeNode(this, path, element);
      node.element = element;
      this.nodes.set(path, node);
      const ref = element.props.ref;
      if (ref && typeof ref === "object" && "current" in ref) {
        (ref as { current: unknown }).current = node;
        this.refs.set(path, ref as { current: unknown });
      }
    }
  }
}

/** Calls `visit` for each element in the tree, with a path that stays the same while its place does. */
function walk(node: ReactNode, path: string, visit: (element: El, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child as ReactNode, `${path}/${i}`, visit));
    return;
  }
  if (!isValidElement(node)) return;
  const element = node as El;
  const type = typeof element.type === "string" ? element.type : ((element.type as { name?: string }).name ?? "x");
  const here = `${path}/${type}${element.key !== null ? `#${element.key}` : ""}`;
  visit(element, here);
  walk(element.props.children as ReactNode, here, visit);
}

/** Every element in the tree, in page order, including those handed to child components. */
export function elements(tree: ReactNode): El[] {
  const out: El[] = [];
  walk(tree, "root", (element) => out.push(element));
  return out;
}

/** The one element that matches. It fails the test with `what` when there is none, or more than one. */
export function one(tree: ReactNode, match: (element: El) => boolean, what: string): El {
  const found = elements(tree).filter(match);
  if (found.length !== 1) throw new Error(`Expected one ${what}, found ${found.length}`);
  return found[0];
}

/** The text an element holds, joined. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => textOf(n as ReactNode)).join("");
  if (isValidElement(node)) return textOf((node as El).props.children as ReactNode);
  return "";
}

export interface Mounted<P> {
  /** What the component drew last. */
  tree(): ReactNode;
  /** Draws again with new props, the way a parent's redraw would. */
  rerender(props: P): void;
  /** Runs an event, then draws again while its state changes. */
  act(event: () => void): void;
  /** Waits for promises the component started, then draws again. */
  settle(): Promise<void>;
  /**
   * Takes the component off the page the way React does when its parent stops drawing it or
   * draws it with a new key: every effect's cleanup runs, and its elements leave the page.
   */
  unmount(): void;
}

interface Options {
  /** Runs effects after each draw. Off for a component whose effects need a real browser. */
  effects?: boolean;
  dom?: FakeDom;
}

/** Draws `component` with `props`, keeping its hooks between draws the way React does. */
export function mount<P>(component: (props: P) => ReactNode, first: P, options: Options = {}): Mounted<P> {
  const slots: unknown[] = [];
  let props = first;
  let index = 0;
  let drawing = false;
  let drawAgain = false;
  let dirty = false;
  let unmounted = false;
  let tree: ReactNode = null;

  const slot = <T>(make: () => T): T => {
    const i = index++;
    if (i >= slots.length) slots.push(make());
    return slots[i] as T;
  };

  const changed = () => {
    if (drawing) drawAgain = true;
    else dirty = true;
  };

  const useEffect = (create: () => void | (() => void), deps?: Deps) => {
    const isNew = index >= slots.length;
    const s = slot<EffectSlot>(() => ({ deps, create, due: true }));
    if (isNew) return;
    if (depsChanged(s.deps, deps)) s.due = true;
    s.create = create;
    s.deps = deps;
  };

  const dispatcher = {
    useState<T>(init: T | (() => T)) {
      const s = slot(() => {
        const box: { value: T; set: (action: T | ((cur: T) => T)) => void } = {
          value: typeof init === "function" ? (init as () => T)() : init,
          set: (action) => {
            const next = typeof action === "function" ? (action as (cur: T) => T)(box.value) : action;
            if (Object.is(next, box.value)) return;
            box.value = next;
            changed();
          },
        };
        return box;
      });
      return [s.value, s.set];
    },
    useRef<T>(init: T) {
      return slot(() => ({ current: init }));
    },
    useId() {
      const i = index;
      return slot(() => `«h${i}»`);
    },
    useMemo<T>(make: () => T, deps: Deps) {
      const s = slot<{ value?: T; deps?: Deps; set: boolean }>(() => ({ set: false }));
      if (!s.set || depsChanged(s.deps, deps)) {
        s.value = make();
        s.deps = deps;
        s.set = true;
      }
      return s.value as T;
    },
    useCallback<T>(fn: T, deps: Deps) {
      return dispatcher.useMemo(() => fn, deps);
    },
    useEffect,
    useLayoutEffect: useEffect,
  };

  function drawOnce(): void {
    index = 0;
    drawing = true;
    drawAgain = false;
    const before = INTERNALS.H;
    INTERNALS.H = dispatcher;
    try {
      tree = component(props);
    } finally {
      INTERNALS.H = before;
      drawing = false;
    }
  }

  function runEffects(): void {
    if (options.effects === false) return;
    for (const s of slots) {
      if (!s || typeof s !== "object" || !("create" in s)) continue;
      const effect = s as EffectSlot;
      if (!effect.due) continue;
      effect.due = false;
      effect.cleanup?.();
      const cleanup = effect.create();
      effect.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
  }

  function draw(): void {
    for (let n = 0; n < MAX_DRAWS; n++) {
      dirty = false;
      do drawOnce();
      while (drawAgain);
      options.dom?.commit(tree);
      runEffects();
      if (!dirty) return;
    }
    throw new Error("The component kept changing its state");
  }

  draw();
  return {
    tree: () => tree,
    rerender(next) {
      props = next;
      draw();
    },
    act(event) {
      event();
      if (dirty && !unmounted) draw();
    },
    async settle() {
      for (let n = 0; n < 10; n++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (dirty && !unmounted) draw();
      }
    },
    unmount() {
      unmounted = true;
      for (const s of slots) {
        if (!s || typeof s !== "object" || !("create" in s)) continue;
        const effect = s as EffectSlot;
        effect.cleanup?.();
        effect.cleanup = undefined;
      }
      tree = null;
      options.dom?.commit(null);
    },
  };
}
