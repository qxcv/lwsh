Todo List
=========

+ Add a way of stopping pomodoros (ugh). This may require voting.
+ Add a way of kicking misbehaving users.
+ Make pomodoro timer control less obtuse. A button or two would be nice :-)
+ Fix the 'die' message so that it doesn't kick off duplicated clients. At the
  moment, the clients will appear to die until they send their next alive() :P
+ Add sounds for chat and pomodoro events. I'm thinking 1-2s vuvuzela sample for chat
  messages and siren for pomodoro events. The tricky bit here is figuring out
  how to add an "add message" handler into the reactive architecture.
+ Fix the bug that allows users to double-enable the camera :-(
  - Make delta frames work at an acceptable pace. At the moment they are so slow
    that they'll cause everything to freeze up and die with more than a few
    clients ;_;
+ Remove autopublish.
+ Refactor everything ruthlessly. The code is needlessly complex at the moment.
+ Fix the name overflow bug in the room occupants list. Also, put a length limit
  on names ;-)
+ Implement a UID-based user icon system. This should distinguish imposters from
  the genuine owners of a name (assuming that the genuine owners are sufficiently
  well known).
