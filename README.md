# forth-playground

Forth experiments.

forth00.js -- bootstrapping Forth. VARIABLE, ARRAY, CREATE/DOES>, IF, BEGIN, AGAIN, VALUE/DEFER, and stuff. Butchered, Ruby-like syntax:
```
DEF COUNTER
  CREATE ,
  RETURN DUP 1 SWAP +! @
END
0 COUNTER AUTOPK
AUTOPK PUTS  # => 1
AUTOPK PUTS  # => 2

DEF DIP SWAP >R EXECUTE R> END
3 2 { 7 * } DIP PRINT SPACE PUTS  # => (in the order of print/puts) 2 3 7 * = 2 21
```
