const BUILT_IN_WRITES = {
  ["Set"]: ["add", "delete", "clear"],
  ["Map"]: ["set", "delete", "clear"],
  // prettier-ignore
  ["Array"]: ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill"],
};

const BUILT_IN_READS = {
  ["Set"]: ["has", "size", "values", "entries", "forEach"],
  ["Map"]: ["has", "size", "values", "entries", "forEach", "get"],
  // prettier-ignore
  ["Array"]: ["concat", "includes", "indexOf", "join", "lastIndexOf", "slice", "toString", "toLocaleString", "entries", "keys", "values", "find", "findIndex", "filter", "map", "reduce", "reduceRight", "every", "some", "forEach"],
};

// FUNCTIONS AND GLOBAL STATE
const reads = new Set();
const subscriptions = new Map();
const observables = new Set();

const autorun = (fn) => {
  reads.clear();
  fn();
  const currentReads = new Set(reads);

  if (!currentReads.size) return () => {}; // no reads, no need to subscribe, nothing to cleanup

  const previousReads = new Set(); // alternative is less performant, but would build up all code paths: subscriptions.get(fn)?.reads || new Set();

  subscriptions.set(fn, {
    reads: new Set(currentReads, previousReads),
    function: fn,
  });

  return () => subscriptions.delete(fn);
};

const observable = (target, key) => {
  let internalState = target[key]; // internal value to be used in the getter and setter

  const keySymbol = Symbol(`${key}`); // unique symbol for each key to avoid collisions with other keys

  observables.add(keySymbol);

  const internalStateType =
    internalState?.constructor?.name || typeof internalState;

  const builtInWrites = BUILT_IN_WRITES[internalStateType] || []; // built in functions that make changes to the value
  const builtInReads = BUILT_IN_READS[internalStateType] || []; // built in functions that read the value

  const runSubscriptions = () => {
    subscriptions.forEach((subscription) => {
      if (!subscription.reads.has(keySymbol)) return;
      autorun(subscription.function); // recapture reads and alter the subscription for if/else and different code paths
    });
  };

  const recursivelyWrapInObservable = () => {
    if (typeof internalState !== "object") return;

    Object.keys(internalState)
      .filter((key) => !builtInReads.includes(key))
      .filter((key) => !builtInWrites.includes(key))
      .forEach((key) => observable(internalState, key));
  };

  const wrapWithRead = (functionName) => {
    const original = internalState[functionName];
    internalState[functionName] = (...args) => {
      reads.add(keySymbol);
      return original.apply(internalState, args);
    };
  };

  const wrapWithWrite = (functionName) => {
    const original = internalState[functionName];
    internalState[functionName] = (...args) => {
      original.apply(internalState, args);
      recursivelyWrapInObservable(); // make all properties observable after a write
      runSubscriptions();
    };
  };

  builtInWrites.forEach(wrapWithWrite);
  builtInReads.forEach(wrapWithRead);

  Object.defineProperty(target, key, {
    get() {
      reads.add(keySymbol);
      return internalState;
    },
    set(value) {
      internalState = value;
      runSubscriptions();
    },
  });

  recursivelyWrapInObservable(); // observe nested properties
};

const makeObservable = (target, props) => {
  Object.keys(props).forEach((key) => {
    props[key](target, key);
  });
};

// FULL EXAMPLE ------------------------------------------------------------------------------------------------------------------------------------------------------------

class Todo {
  constructor({ authorId, title, description, completed }) {
    this.authorId = authorId;
    this.title = title;
    this.description = description;
    this.completed = completed;

    makeObservable(this, {
      authorId: observable,
      title: observable,
      description: observable,
      completed: observable,
    });
  }

  setCompleted(completed) {
    this.completed = completed;
  }

  setTitle(title) {
    this.title = title;
  }

  setDescription(description) {
    this.description = description;
  }
}

class TodoList {
  constructor(config) {
    this.todos = new Set();
    this.config = config;

    makeObservable(this, {
      todos: observable,
      config: observable,
    });
  }

  get totalTodos() {
    return this.todos.size;
  }

  get completedTodos() {
    return [...this.todos].filter((todo) => todo.completed).length;
  }

  get owner() {
    return this.config.owner;
  }

  get guests() {
    return this.config.guests;
  }

  // Actions
  addTodo(todo) {
    this.todos.add(todo);
  }

  clearTodos() {
    this.todos.clear();
  }

  addGuest(guest) {
    this.config.guests.push(guest);
  }

  clearGuests() {
    this.config.guests = [];
  }
}

const todoList = new TodoList({
  owner: {
    id: 1,
    firstName: "John",
    lastName: "Doe",
  },
  guests: [],
});

const cleanupCollaboration = autorun(() => {
  const guestString = todoList.guests?.length
    ? todoList.guests.map(({ firstName }) => firstName).join(", ")
    : "no one";

  console.log(
    `${todoList.owner.firstName} ${todoList.owner.lastName} is collaborating with ${guestString}`
  );
});

const cleanupCompleted = autorun(() => {
  if (!todoList.totalTodos) {
    console.log("No todos");
    return;
  }

  console.log(
    `Todos completed ${todoList.completedTodos}/${todoList.totalTodos}`
  );
});

// add johns todo
const johnsTodo = new Todo({
  authorId: 1,
  title: "This is a task",
  description: "I have amazing things to do",
  completed: false,
});
todoList.addTodo(johnsTodo);
johnsTodo.setCompleted(true);

// add a guest and a todo for them
todoList.addGuest({
  id: 3,
  firstName: "Jack",
  lastName: "Doe",
});
const jacksTodo = new Todo({
  authorId: 3,
  title: "This is a task",
  description: "I have amazing things to do",
  completed: false,
});
todoList.addTodo(jacksTodo);
jacksTodo.setCompleted(true);

// add another guest and a todo for them
todoList.addGuest({
  id: 3,
  firstName: "Jane",
  lastName: "Doe",
});
const janesTodo = new Todo({
  authorId: 3,
  title: "This is a task",
  description: "I have amazing things to do",
  completed: false,
});
todoList.addTodo(janesTodo);
janesTodo.setCompleted(true);

// jane changed her first name
todoList.guests[1].firstName = "Janet";

cleanupCollaboration();
cleanupCompleted();

todoList.clearTodos(); // without the cleanup, this would log "No todos"
todoList.clearGuests(); // without the cleanup, this would log "John Doe is collaborating with no one"

// console.log(observables);
