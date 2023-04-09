// CONSTANTS
const SET_WRITES = ["add", "delete", "clear"];
const SET_READS = ["has", "size", "values", "entries", "forEach"];
const MAP_WRITES = ["set", "delete", "clear"];
const MAP_READS = ["has", "size", "values", "entries", "forEach", "get"];
// prettier-ignore
const ARRAY_WRITES = ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill"];
// prettier-ignore
const ARRAY_READS = ["concat", "includes", "indexOf", "join", "lastIndexOf", "slice", "toString", "toLocaleString", "entries", "keys", "values", "find", "findIndex", "filter", "map", "reduce", "reduceRight", "every", "some", "forEach"];

// FUNCTIONS AND GLOBAL STATE
const reads = new Set();
const subscriptions = new Map();

const autorun = (fn) => {
  reads.clear();
  fn();
  const currentReads = new Set(reads);

  if (currentReads.size) {
    const previousReads = new Set(); // less performant, but should build up all code paths: subscriptions.get(fn)?.reads || new Set();

    subscriptions.set(fn, {
      reads: new Set(currentReads, previousReads),
      function: fn,
    });
  }

  return () => {
    subscriptions.delete(fn);
  };
};

const observable = (target, key) => {
  let internalState = target[key]; // internal value to be used in the getter and setter

  const keySymbol = Symbol(`${key}`); // unique symbol for each key to avoid collisions with other keys

  const runSubscriptions = () => {
    subscriptions.forEach((subscription) => {
      if (subscription.reads.has(keySymbol)) {
        autorun(subscription.function); // recapture reads and alter the subscription for if/else and different code paths
      }
    });
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
      runSubscriptions();
    };
  };

  if (internalState instanceof Set) {
    SET_WRITES.forEach(wrapWithWrite);
    SET_READS.forEach(wrapWithRead);
  }

  if (internalState instanceof Map) {
    MAP_WRITES.forEach(wrapWithWrite);
    MAP_READS.forEach(wrapWithRead);
  }

  if (Array.isArray(internalState)) {
    ARRAY_WRITES.forEach(wrapWithWrite);
    ARRAY_READS.forEach(wrapWithRead);
  }

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

  // recursively make all properties observable
  if (typeof internalState === "object") {
    Object.keys(internalState).forEach((key) => {
      observable(internalState, key);
    });
  }
};

const makeObservable = (target, props) => {
  Object.keys(props).forEach((key) => {
    props[key](target, key);
  });
};

// FULL EXAMPLE

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
  id: 2,
  firstName: "Jane",
  lastName: "Doe",
});

const janesTodo = new Todo({
  authorId: 2,
  title: "This is a task",
  description: "I have amazing things to do",
  completed: false,
});

todoList.addTodo(janesTodo);

// jane changed her first name
todoList.guests[0].firstName = "Janet";

// log all subscription reads
subscriptions.forEach((subscription) => {
  console.log([...subscription.reads]);
});

cleanupCollaboration();
cleanupCompleted();

todoList.clearTodos(); // without the cleanup, this would log "No todos"
todoList.clearGuests(); // without the cleanup, this would log "John Doe is collaborating with no one"
