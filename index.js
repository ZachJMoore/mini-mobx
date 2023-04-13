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
    const previousReads = new Set(); // alternative is less performant, but would build up all code paths: subscriptions.get(fn)?.reads || new Set();

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

  const builtInWrites = [];
  const builtInReads = [];

  const wrapWithObservable = (targetValue) => {
    if (typeof targetValue === "object") {
      Object.keys(targetValue)
        .filter((key) => {
          // wasn't sure how to get around wrapWithRead & wrapWithWrite adding values directly to the value (instead of the prototype), so I'm filtering them out here
          return !builtInWrites.includes(key) && !builtInReads.includes(key);
        })
        .forEach((key) => {
          observable(targetValue, key);
        });
    }
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
      wrapWithObservable(internalState); // recursively make all properties observable after a write
      runSubscriptions();
    };
  };

  if (internalState instanceof Set) {
    builtInWrites.push(...SET_WRITES);
    builtInReads.push(...SET_READS);
  }

  if (internalState instanceof Map) {
    builtInWrites.push(...MAP_WRITES);
    builtInReads.push(...MAP_READS);
  }

  if (Array.isArray(internalState)) {
    builtInWrites.push(...ARRAY_WRITES);
    builtInReads.push(...ARRAY_READS);
  }

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

  // recursively make all properties observable
  wrapWithObservable(internalState);
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
