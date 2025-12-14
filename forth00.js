// Architecture
//
// 32-bit virtual computer with CPU, RAM and two stacks
const CELL = 4;  // 32-bit architecture
const HEAP_SIZE = 1024 * 1024 * CELL;  // Size of VM
const DATA_STACK_SIZE = 128 * CELL;  // Size in bytes of data stack
const RETURN_STACK_SIZE = 128 * CELL;  // Size in bytes of return stack

// Implement interfaces to communicate with the architecture
var heap = new ArrayBuffer(HEAP_SIZE);
var i32 = new Int32Array(heap);
var u8 = new Uint8Array(heap);

// Data and return stacks live on dedicated "chips" managed by the operating
// system. In this case--Javascript.
const ds = [];
const rs = [];

// These methods may look redundant, but they are not. I am abstracting
// Javascript semantics and defining a communication protocol/interface for
// stacks.
const pushds = v => ds.push(v);
const popds = () => ds.pop();
const pushrs = v => rs.push(v);
const poprs = () => rs.pop();

// Registers
const FORTH       = 0x04;  // Forth Vocabulary
const CONTEXT     = 0x19;  // Current search vocabulary
const CURRENT     = 0x1b;  // Current vocabulary
const LATEST_CELL = 0x1c;  // Last name in dictionary
const HERE_CELL   = 0x1d;  // Next available cell
const STATE       = 0x20;  // State of compiler

// Interpreter
//
const ALIGN_MASK = ~(CELL - 1);  // Align value to a cell size

const F_IMMEDIATE = 0b10000000;  // Immediate word
const F_DATA      = 0b01000000;  // Data or code opcode
const F_HIDDEN    = 0b00100000;  // Hidden word
const F_LENMASK   = 0b00011111;  // Length mask

const aligned = addr => addr + CELL - 1 & ALIGN_MASK;
const align = () => i32[HERE_CELL] = aligned(i32[HERE_CELL]);
const i32_comma = val => {
  i32[i32[HERE_CELL] >> 2] = val;
  i32[HERE_CELL] += CELL;
};
const u8_comma = val => {
  u8[i32[HERE_CELL]] = val;
  i32[HERE_CELL] += 1;
};
const buf_comma = buf => {
  for (let char of buf) {
    u8_comma(char.charCodeAt(0));
  }
};

const create = (name, flags) => {
  // Dictonary structure:
  // Link pointer | 4 bytes |
  // Length/flags | 1 byte  |
  // Name         | n bytes |
  //              | align   |
  // Definition   | m bytes |
  // - codeword (1 cell for DOCOL, 2 cells for DOVAR and DORETURN: TODO needs
  //   unification) - CFA
  // - instructions - BODY
  const latest = i32[LATEST_CELL];

  i32[LATEST_CELL] = i32[HERE_CELL];
  i32_comma(latest);
  u8_comma(name.length | flags);
  buf_comma(name);
  align();
};

const table = {};  // Look up table for builtins; put simply, CPU intructions

const defcode = (name, flags, fn) => {
  const op = Object.keys(table).length;
  table[op] = fn;
  create(name, flags);
  i32_comma(op);
};

const cfa = addr => {
  const cell = u8[addr + CELL];
  const len = cell & F_LENMASK;
  return aligned(addr + 1 + len + CELL);
};

const find = target => {
  const n = target.length;
  for (let it = i32[i32[CONTEXT]]; it > 0; it = i32[it >> 2]) {
    const cell = u8[it + CELL];
    const len = cell & F_LENMASK;
    const is_hidden = cell & F_HIDDEN;
    const addr = it + CELL + 1;
    const name = String.fromCharCode(...u8.slice(addr, addr + len));
    if (target === name && n === len && is_hidden === 0) return it;
  }

  // not found
  return -1;
};

// RAM, unoptimized system block diagram, 48 cells:
//
// 0x00 ___                0x10 ___                0x20 STATE
// 0x01 ___                0x11 ___                0x21 ___
// 0x02 ___                0x12 ___                0x22 ___
// 0x03 ___                0x13 ___                0x23 <empty>
// 0x04 FORTH              0x14 ___                0x24 <empty>
// 0x05 ___                0x15 ___                0x25 <empty>
// 0x06 ___                0x16 ___                0x26 <empty>
// 0x07 ___                0x17 ___                0x27 <empty>
// 0x08 ___                0x18 ___                0x28 <empty>
// 0x09 ___                0x19 CONTEXT            0x29 <empty>
// 0x0A ___                0x1A ___                0x2A <empty>
// 0x0B ___                0x1B CURRENT            0x2B <empty>
// 0x0C ___                0x1C ___                0x2C <empty>
// 0x0D ___                0x1D HERE_CELL          0x2D <empty>
// 0x0E ___                0x1E LATEST_CELL        0x2E <empty>
// 0x0F ___                0x1F ___                0x2F <empty>

// Interpreter
//
const is_delimiter = (char, delimiter) => char === delimiter || char === "\n" || char === undefined;

const pad = word => {
  const here = i32[HERE_CELL];
  for (let i = 0; i < word.length; i++) u8[here + i] = word[i].charCodeAt(0);
  return here;
};

// Unclear if "HERE" CPU instruction would make it more interesting?
// const here = () => i32[HERE_CELL];

const parse = delimiter => {
  // Detect a word by reading from text buffer and return a word, otherwise -1
  let val = null;
  let char = null;
  let word = "";

  // Skip leading delimiters
  do {
    val = $buffer.next();
    if (val.done === false) char = val.value;
    else return -1;
  } while (is_delimiter(char, delimiter));

  // Read word until a delimiter
  do {
    if (val.done === false) word += char;
    else return -1;

    val = $buffer.next();
    char = val.value;
  } while (!is_delimiter(char, delimiter));

  return word;
};

const convert = word => {
  // detect base and convert a number accordingly:
  // "0x10" -> 16
  // "0b00110001" -> 49
  // "32" -> 32
  // Could be generalized with denotations, and so it would simplify strings
  if (word.startsWith("0x")) return parseInt(word.substring(2), 16);
  else if (word.startsWith("0b")) return parseInt(word.substring(2), 2);
  else return parseInt(word, 10);
};

// Initialize virtual machine memory
//
i32[CURRENT] = FORTH;
i32[CONTEXT] = FORTH;

i32[HERE_CELL] = 0x23 * CELL; // This is the first empty slot in system memory
i32[LATEST_CELL] = 0;
i32[STATE] = 0; // Be explicit about the interpreter mode

// Initialize built-in words and Forth virtual machine
//
const next1 = (np) => [i32[np >> 2], np + CELL];

// DOCOL and DOVAR are special code words, not a subroutine. They execute
// operation and continue, rather than execute a jump. 0 means that DOCOL must
// be defined as the first defcode, DOVAR -- second, etc

// OP_DOCOL is identical to an uninitialized memory, and so if a program
// manipulates with raw memory and has a bug, it may enter an infinite loop.
const OP_DOCOL = 0;
const OP_DOVAR = 1;
const OP_DORETURN = 2;

defcode("DOCOL", 0, (ip, np) => {
  pushrs(np);
  return next1(ip + 2 * CELL);  // DOCOL + reserved cell
});

defcode("DOVAR", F_HIDDEN, (ip, np) => {
  pushds(ip + 2 * CELL);
  return next1(np);
});
defcode("DORETURN", F_HIDDEN, (ip, np) => {
  pushds(ip + 2 * CELL);
  pushrs(np);
  return next1(i32[(ip + CELL) >> 2]);
});
defcode("CREATE", 0, (ip, np) => {
  const word = parse(" "); // white-space delimited words
  create(word, 0);
  i32_comma(OP_DOVAR); // execution semantics: push address onto data
  // stack
  i32_comma(0); // empty cell, could be overrided by DORETURN
  i32[i32[CURRENT]] = i32[LATEST_CELL];
  return next1(np);
});
defcode("DEF", 0, (ip, np) => {
  const word = parse(" "); // white-space delimited words
  create(word, 0);
  i32_comma(OP_DOCOL);     // execution semantics: jump
  i32_comma(0);            // reserved cell for consistency
  i32[STATE] = 1;
  return next1(np);
});
defcode("RETURN", 0, (ip, np) => {
  // replaces the execution semantics of the most recent definition (hence the
  // behavior is undefined if executed outside of CREATE) with the execution
  // semantics from RETURN and returns the execution
  if (rs.length === 0) throw new Error("RETURN is compile/colon-only (return stack empty)");

  const latest = i32[LATEST_CELL]
  if (latest === 0) throw new Error("RETURN with no latest word");

  const xt = cfa(latest);
  const cw = i32[xt >> 2];

  if (cw !== OP_DOVAR) {
    throw new Error("RETURN expects latest word to be CREATEd (codeword != DOVAR)");
  }

  i32[xt >> 2] = OP_DORETURN;
  i32[(xt + CELL) >> 2] = np;
  return next1(poprs());
});
defcode("END", F_IMMEDIATE, (ip, np) => {
  i32_comma(cfa(find("EXIT")));
  i32[STATE] = 0;
  i32[i32[CURRENT]] = i32[LATEST_CELL];
  return next1(np);
});
defcode("IMMEDIATE", F_IMMEDIATE, (ip, np) => {
  // mark latest word in the current context immediate
  const flags = i32[i32[CURRENT]] + CELL;
  u8[flags] = u8[flags] | F_IMMEDIATE;

  return next1(np);
});
defcode("DUMP", 0, (ip, np) => {
  const len = popds();
  const start = popds();

  let result = "";
  let asciiPart = "";

  for (let i = start; i < start + len; i++) {
    if ((i - start) % 16 === 0) {
      result += asciiPart;
      asciiPart = "";
      if (i - start > 0) result += "\n";
      result += `A${i.toString(16).padStart(5, "0").toUpperCase()}: `;
    } else if ((i - start) % 8 === 0) result += "- ";
    else if ((i - start) % 4 === 0) result += " ";

    const val = u8[i];
    result += `${val.toString(16).padStart(2, "0")} `;

    if (val > 31 && val < 127) asciiPart += String.fromCharCode(val);
    else asciiPart += ".";

    if ((i - start) % 16 === 15) asciiPart += "  ";
  }

  console.log(result + asciiPart);

  return next1(np);
});
defcode("LIT", 0, (ip, np) => {
  pushds(i32[np >> 2]);
  return next1(np + CELL);
});
defcode("EXIT", 0, (ip, np) => next1(poprs()));
defcode("BYE", 0, (ip, np) => [-1, np]);
defcode("PARSE", 0, (ip, np) => {
  // ( delimeter -- addr length )
  const delim = String.fromCharCode(popds());
  const word = parse(delim);
  const addr = pad(word);
  pushds(addr);
  pushds(word.length);
  return next1(np);
});
defcode("FIND", 0, (ip, np) => {
  // ( addr length -- cfa )
  const len = popds();
  const addr = popds();
  const word = String.fromCharCode(...u8.slice(addr, addr + len));
  pushds(cfa(find(word)));
  return next1(np);
});
defcode("EXECUTE", 0, (ip, np) => {
  return [popds(), np];
});
defcode(">CFA", 0, (ip, np) => {
  pushds(cfa(popds()));
  return next1(np);
});
defcode("DROP", 0, (ip, np) => {
  popds();
  return next1(np);
});
defcode("OVER", 0, (ip, np) => {
  const a = popds();
  const b = popds();
  pushds(b);
  pushds(a);
  pushds(b);
  return next1(np);
});
defcode("SWAP", 0, (ip, np) => {
  const a = popds();
  const b = popds();
  pushds(a);
  pushds(b);
  return next1(np);
});
defcode("DUP", 0, (ip, np) => {
  const a = popds();
  pushds(a);
  pushds(a);
  return next1(np);
});
defcode("BRANCH", 0, (ip, np) => next1(i32[np >> 2]));
defcode("0BRANCH", 0, (ip, np) => {
  const val = popds();
  if (val === false || val === 0) return next1(i32[np >> 2]);
  else return next1(np + CELL);
});
defcode("=", 0, (ip, np) => {
  pushds(popds() === popds());
  return next1(np);
});
defcode("0<", 0, (ip, np) => {
  pushds(popds() < 0);
  return next1(np);
});
defcode("+", 0, (ip, np) => {
  pushds(popds() + popds());
  return next1(np);
});
defcode("-", 0, (ip, np) => {
  const n = popds();
  pushds(popds() - n);
  return next1(np);
});
defcode("*", 0, (ip, np) => {
  pushds(popds() * popds());
  return next1(np);
});
defcode("/", 0, (ip, np) => {
  pushds(popds() / popds());
  return next1(np);
});
defcode("EMIT", 0, (ip, np) => {
  process.stdout.write(String.fromCodePoint(popds()));
  return next1(np);
});
defcode("PRINT", 0, (ip, np) => {
  process.stdout.write(String(popds()));
  return next1(np);
});
defcode("@", 0, (ip, np) => {
  pushds(i32[popds() >> 2]);
  return next1(np);
});
defcode("!", 0, (ip, np) => {
  i32[popds() >> 2] = popds();
  return next1(np);
});
defcode("C@", 0, (ip, np) => {
  pushds(u8[popds()]);
  return next1(np);
});
defcode("C!", 0, (ip, np) => {
  u8[popds()] = popds();
  return next1(np);
});
defcode(">R", 0, (ip, np) => {
  pushrs(popds());
  return next1(np);
});
defcode("R>", 0, (ip, np) => {
  pushds(poprs());
  return next1(np);
});
defcode("EVALUATE", 0, (ip, np) => {
  // Algorithm:
  // 1) Read in a space delimited Forth WORD from text buffer.
  // 2) Is this WORD in the dictionary?
  //    FOUND)          Are we in COMPILE mode and reading NOT IMMEDIATE WORD?
  //                    YES) Compile WORD into the dictionary.
  //                    NO)  Push CFA onto data stack
  //    NOT-FOUND)      Is this actually a number?
  //                    YES) Are we in IMMEDIATE mode?
  //                         IMMEDIATE-MODE) Push number onto the stack.
  //                         COMPILE-MODE)   Compile a literal number.
  //                    NO)  Error! Handle error

  const word = parse(" ");

  // find(word) could return cfa, but then I need >FLAGS method to identify
  // whether a word is IMMEDIATE or not. Ironically, FIND word returns CFA.
  const addr = find(word);
  if (addr > 0) {
    const is_immediate = u8[addr + CELL] & F_IMMEDIATE;
    const is_compiling = i32[STATE];
    // compile a word
    if (is_compiling !== 0 && is_immediate === 0) i32_comma(cfa(addr));
    // execute a word (aka jump to word's cfa)
    else return [cfa(addr), np];
  } else {
    const number = convert(word);
    if (!isNaN(number)) {
      const is_compiling = i32[STATE];
      if (is_compiling !== 0) {
        i32_comma(cfa(find("LIT")));
        i32_comma(number);
      } else {
        pushds(number);
      }
    } else {
      throw new Error("Unknown word: " + word);
    }
  }
  return next1(np);
});

i32[i32[CURRENT]] = i32[LATEST_CELL];

const start = i32[HERE_CELL];
i32_comma(cfa(find("EVALUATE")));
i32_comma(cfa(find("BRANCH")));
i32_comma(start);

const boot = `
DEF BL 32 END
DEF NL 10 END

DEF #
  NL PARSE DROP DROP
END IMMEDIATE

# Now can leave comments!

DEF CELL 4 END
DEF CELL+ CELL + END
DEF CELL- CELL - END
DEF CELLS CELL * END

DEF CP 29 CELLS END
DEF HERE CP @ END

DEF +! SWAP OVER @ + SWAP ! END
DEF ALLOT CP +! END

DEF , HERE CELL ALLOT ! END

DEF REGISTER
  CREATE ,
  RETURN @ CELLS
END
32 REGISTER STATE

DEF STATE? STATE @ END
DEF [
  0 STATE !
END IMMEDIATE
DEF ]
  1 STATE !
END IMMEDIATE

# see CONTROL below for more interesting definition
DEF CR NL EMIT END
DEF SPACE BL EMIT END

DEF CONTROL
  CREATE ,
  RETURN @ EMIT
END

# NL CONTROL CR
# BL CONTROL SPACE

DEF PUTS PRINT CR END

DEF 2DUP OVER OVER END
1 2 2DUP PRINT SPACE PRINT SPACE PRINT SPACE PUTS  # => 2 1 2 1

2 37 + PUTS  # => 39

DEF ADD2 2 + END
1 ADD2 PUTS  # => 3

DEF ADD3 3 + END
1 ADD2 ADD3 PUTS  # => 6

DEF NEGATE -1 * END
5 NEGATE PUTS  # => -5

DEF SCALL ADD3 END
1 SCALL 5 * PUTS  # => 20

DEF PERCENT 100 * / END
130 50 PERCENT PUTS  # => 38.4615...

7 10 - PUTS  # => -3
5 10 DROP PUTS  # 5
1 2 SWAP PRINT SPACE PUTS  # => 1 2
3 4 OVER PRINT SPACE PRINT SPACE PUTS  # => 3 4 3
5 DUP PRINT SPACE PUTS  # => 5 5

# TEST ALLOT
HERE PUTS  # => <number>
CELL ALLOT
HERE PUTS  # => <number+CELL>

DEF ? @ PUTS END

# TEST ,
HERE PUTS  # => <number>
123 ,
HERE CELL- ?  # => 123
HERE PUTS  # => <number+CELL>

DEF VAR CREATE 0 , END
VAR VAR99
VAR99 PUTS  # => <addr>
VAR99 ?  # => 0
99 VAR99 !
VAR99 ?  # => 99

CREATE VAR98 98 ,
VAR98 ?  # => 98
97 VAR98 !
VAR98 ?  # => 97

DEF COUNTER
  CREATE ,
  RETURN DUP 1 SWAP +! @
END
0 COUNTER AUTOPK
AUTOPK PUTS  # => 1
AUTOPK PUTS  # => 2

# In Javascript this is done with closures:
# const counter = init => {
#   let x = init;
#   return () => { x += 1; return x; };
# };
# const autopk = counter(0);
# console.log(autopk());  // => 1
# console.log(autopk());  // => 2

# A closure is a good example how memory could be manipulated directly to define
# data structures. For example, it is possible to define trie data structure
# using the same approach (http://www.forth.org/fd/FD-V04N3.pdf) or hashmap
# (http://c2.com/wiki/remodel/?ExampleForthCode)

DEF CONST
  CREATE ,
  RETURN @
END
1024 CONST 1K
1K PUTS  # => 1024

DEF ARRAY
  CREATE CELLS ALLOT
  RETURN SWAP CELLS +
END

30 ARRAY NOVEMBER
11 5 NOVEMBER !
5 NOVEMBER ?  # => 11

DEF ' BL PARSE FIND END
24 ' PUTS EXECUTE  # => 24

' PUTS 8 CELLS DUMP  # => hux dump

DEF >BODY 2 CELLS + END

# Surely, I can change constants, where "2 CELL +" is >BODY
1024 CONST 1K_DUP
1025 ' 1K >BODY !
1K PUTS  # => 1025
1K_DUP PUTS  # => 1024

DEF COMPILE R> DUP @ , CELL+ >R END  # A bit different implementation than in eForth

# While IF/THEN/ELSE definitions are not very difficult to understand. I think,
# I like the PostScript notation more, which uses quotations such as: bool { if
# true } { if false } ifelse
DEF IF COMPILE 0BRANCH HERE 0 , END IMMEDIATE
DEF THEN HERE SWAP ! END IMMEDIATE
DEF ELSE COMPILE BRANCH HERE 0 , SWAP HERE SWAP ! END IMMEDIATE

DEF ABS
  DUP 0< IF NEGATE THEN
END

10 ABS PUTS  # => 10
-9 ABS PUTS  # => 9

DEF DUMMYELSE
  DUP 0< IF NEGATE ELSE DROP 1 THEN
END
10 DUMMYELSE PUTS  # => 1

DEF BEGIN HERE END IMMEDIATE
DEF AGAIN COMPILE BRANCH , END IMMEDIATE
DEF UNTIL COMPILE 0BRANCH , END IMMEDIATE

DEF STAR 42 EMIT END
STAR CR  # => *

DEF ZERO? 0 = END
DEF != = ZERO? END

DEF STARS
  BEGIN
    STAR
  1 - DUP ZERO? UNTIL
  DROP
END
10 STARS CR  # => **********


1 1 = CONST TRUE
0 1 = CONST FALSE
TRUE PUTS  # => 1


CREATE TO-MESSAGE 1 ,  # VAR TO-MESSAGE 1 TO-MESSAGE ! but shorter
                       # 0 = TO | 1 = FROM
DEF TO 0 TO-MESSAGE ! END

DEF VALUE
  CREATE ,
  RETURN
    TO-MESSAGE @ ZERO? IF ! ELSE @ THEN
    1 TO-MESSAGE !
END

12 VALUE APPLES
APPLES PUTS  # => 12
34 TO APPLES
APPLES PUTS  # => 34


# Deferred action
DEF LITERAL
  STATE? IF COMPILE LIT , THEN
END IMMEDIATE
DEF HELLO-LITERAL LITERAL 13 END
HELLO-LITERAL PUTS
LITERAL 14 PUTS  # => 14

DEF POSTPONE ' , END IMMEDIATE

# Quotations: { ... }  -> xt
# Works at top-level and nested inside DEF.
# Uses data stack as compile-time control stack.
DEF {
  STATE @ IF
    # compiling (nested quote):
    COMPILE LIT
    HERE DUP 0 , DROP          # litCell (patched to qStart by })
    COMPILE BRANCH
    HERE DUP 0 , DROP          # branchCell (patched to after by })
    HERE DUP 0 , 0 , DROP      # qStart: DOCOL + reserved cell
    1                          # tag = nested
  ELSE
    # interpreting (top-level quote):
    HERE DUP 0 , 0 , DROP      # xt; emit DOCOL + reserved cell
    0                          # tag = top-level
    POSTPONE ]                 # enter compile mode for quote body
  THEN
END IMMEDIATE


DEF }
  COMPILE EXIT
  HERE                        # after

  SWAP ZERO? IF               # tag == 0? => top-level close
    DROP                      # drop 'after', keep xt from '{' on stack
    POSTPONE [                # back to interpret
  ELSE
    # nested close: patch lit and branch
    # stack: litCell branchCell qStart after
    >R                        # save after
    SWAP >R                   # save branchCell (stack: litCell qStart  R: branchCell after)
    SWAP !                    # *litCell = qStart
    R> R> SWAP !              # *branchCell = after
  THEN
END IMMEDIATE

{ 2 3 * } EXECUTE PUTS  # => 6

DEF Q1 { 2 4 * } END
Q1 EXECUTE PUTS  # => 8

{ { 2 5 * } EXECUTE 2 + } EXECUTE PUTS  # => 12

# Alternative syntax to DEF
#
# In PostScript notation it may look like /ANSWER { 14 3 * } DEF
{ 14 3 * } CONST ANSWER
ANSWER EXECUTE PUTS  # => 42

# which expands to the following code
HERE 0 , 0 , ] 4 * [ POSTPONE EXIT CONST MULT4
5 MULT4 EXECUTE PUTS  # => 20


# Like VALUE, but also EXECUTEs the token
DEF NOOP END
DEF DEFER
  CREATE COMPILE NOOP
  RETURN
    TO-MESSAGE @ ZERO? IF ! ELSE @ EXECUTE THEN
    1 TO-MESSAGE !
END

DEFER GREET
DEF GREET1 99 END
DEF GREET2 98 END
' GREET2 TO GREET
GREET PUTS  # => 98
' GREET1 TO GREET
GREET PUTS  # => 99
{ 4 25 * } TO GREET
GREET PUTS  # => 100


DEF ROT >R SWAP R> SWAP END
1 2 3 ROT PRINT SPACE PRINT SPACE PUTS  # => 1 3 2
DEF -ROT ROT ROT END
1 2 3 -ROT PRINT SPACE PRINT SPACE PUTS  # => 2 1 3

# Stack manipulation words could be classified by a tuple { Action, Nth element
# }. Some words like SWAP and ROT could be represented as dyadic functions: 1
# SWAP 2 and 1 ROT 3, which is a more generic way of thinking about them.
#
# Op      | Action    | Element
# --------+-----------+--------------------------
# DROP    | discard   | top element
# NIP     | discard   | second element
# SWAP    | move      | second element to the top
# ROT     | move      | third element to the top
# DUP     | copy      | top element
# OVER    | copy      | second element to the top

# Combinators work the same way, except they also carry an additional EXECUTE
# semantic. For example, a list of Factor-like combinators:

DEF DIP SWAP >R EXECUTE R> END
3 2 { 7 * } DIP PRINT SPACE PUTS  # => 2 3 7 * = 2 21

DEF SIP OVER >R EXECUTE R> END
2 { 7 * } SIP PRINT SPACE PUTS  # => 2 2 7 * = 2 14

DEF BI >R SIP R> EXECUTE END
12 { 3 * } { 4 * } BI PRINT SPACE PUTS  # => 12 4 * 12 3 * = 48 36

DEF BI* DIP DIP END
2 4 { 3 * } { 5 * } BI* PRINT SPACE PUTS  # => 2 5 * 2 3 * = 20 6

DEF BI@ DUP BI* END
2 4 { 3 * } BI@ PRINT SPACE PUTS  # => 4 3 * 2 3 * = 12 6

DEF 2DROP DROP DROP END

# Repeat the quotation N times. Keeps the countdown counter on the top of the
# stack.
DEF TIMES
  BEGIN
    OVER EXECUTE
  1 - DUP ZERO? UNTIL
  2DROP
END

{ STAR } 10 TIMES CR  # => **********

{ DUP PRINT SPACE } 5 TIMES CR  # => 5 4 3 2 1



# Scalars and vectors
DEF SHAPE @ END
DEF DATA CELL+ @ END
DEF FIRST DATA @ END

CREATE [1] HERE , HERE CELL+ , 1 ,

[1] PUTS  # => <addr>
[1] SHAPE PUTS  # => shape of [1] is [1]
[1] DATA PUTS  # => <addr+2 cells>
[1] FIRST PUTS  # => 1

DEFER SIZE
{ SHAPE FIRST } TO SIZE


DEF ROT >R SWAP R> SWAP END
1 2 3 ROT PRINT SPACE PRINT SPACE PUTS  # => 1 3 2
DEF -ROT ROT ROT END
1 2 3 -ROT PRINT SPACE PRINT SPACE PUTS  # => 2 1 3

DEF ARRAY2  HERE -ROT , , END

HERE 0 , [1] ARRAY2 CONST [0]
HERE 1 , [0] ARRAY2 CONST []

[0] PUTS  # => <addr>
[0] SHAPE PUTS  # => <the pointer to [1]>
[0] FIRST PUTS  # => 0
[0] SIZE PUTS  # => 1

[] PUTS  # => <addr>
[] SHAPE PUTS  # => pointer to [0]
[] FIRST PUTS  # => 1
[] SIZE PUTS  # => 0

DEF SCALAR HERE SWAP , [] ARRAY2 END

101 SCALAR CONST SCALAR1
SCALAR1 SHAPE PUTS  # => pointer to []
SCALAR1 FIRST PUTS  # => 101
SCALAR1 SIZE PUTS  # => 1

DEF VECTOR HERE SWAP ,  [1] ARRAY2 ARRAY2 END

HERE 103 , 107 ,
2 VECTOR CONST VECTOR1
VECTOR1 SIZE PUTS  # => 2
VECTOR1 FIRST PUTS  # => 103
VECTOR1 DATA CELL+ @ PUTS  # => 107


DEF NEW DUP HERE SWAP CELLS ALLOT SWAP END

5 NEW VECTOR CONST VECTOR2
VECTOR2 SIZE PUTS  # => 5
VECTOR2 FIRST PUTS  # => <some value from an unassigned memory cell>

109 VECTOR2 DATA !
VECTOR2 FIRST PUTS  # => 109

# This EACH implementation is very limited. It assumes that the quotation
# consumes an element from data stack. Otherwise, the application could enter
# the infinite loop. On top of that, it does redundant stack shuffling. If I had
# local variables, the implementation could be simplified.
DEF 3DROP 2DROP DROP END
DEF EACH
  DUP -ROT SIZE  # vector xt size
  BEGIN
    >R OVER DATA
    R> DUP >R 1 - CELLS + @
    OVER EXECUTE R>
  1 - DUP ZERO? UNTIL
  3DROP
END

HERE 113 , 127 , 2 VECTOR CONST VECTOR3
{ PRINT SPACE } VECTOR3 EACH CR  # => 127 113


# Simple locals
0 VALUE HELLO-NAME
DEF HELLO
  TO HELLO-NAME
  HELLO-NAME PUTS
END

20 HELLO  # => 20


BYE
`;

const $buffer = boot[Symbol.iterator]();

// Virtual machine memory is bootstraped, start the machine. This is the heart
// of the Forth interpreter. Caveat: no error handling, a jump to an invalid
// instruction will crash the interpreter.
let [ip, np] = next1(start);
do {
  const op = i32[ip >> 2];
  const fn = table[op];
  if (typeof fn !== "function") {
    throw new Error(`Invalid opcode ${op} at ip=${ip} (cell=${ip >> 2})`);
  }
  [ip, np] = fn(ip, np);
} while (ip >= 0);
