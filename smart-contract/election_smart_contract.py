from pyteal import *
from pyteal_helper import itoa


def approval_program():
    """APPROVAL PROGRAM handles the main logic of the application"""

    i = ScratchVar(TealType.uint64)  # i-variable for for-loop

    on_creation = Seq(  # HOW TO: SKIP COMMAS i.e only works for single legnth vote
        [
            # TODO:
            # Check number of required arguments are present
            Assert(Txn.application_args.length() == Int(3)),
            # Store relevant parameters of the election. When storing the options to vote for,
            App.globalPut(
                Bytes("ElectionEnd"), Btoi(Txn.application_args[0])
            ),  # Global.round() + Btoi(Txn.application_args[0])
            App.globalPut(Bytes("NumVoteOptions"), Btoi(Txn.application_args[1])),
            App.globalPut(
                Bytes("VoteOptions"),
                Txn.application_args[2],  # Bytes(Txn.application_args[2])
            ),  # CHECK THIS --> necessary? or no need?
            # consider storing all of them as a string separated by commas e.g: "A,B,C,D".
            # Note that index-wise, A=0, B=1, C=2, D=3
            # Set all initial vote tallies to 0 for all vote options, keys are the vote options
            For(
                i.store(Int(0)),
                i.load() < Btoi(Txn.application_args[1]),
                i.store(i.load() + Int(1)),
            ).Do(App.globalPut(Concat(Bytes("VotesFor"), itoa(i.load())), Int(0))),
            Return(Int(1)),
        ]
    )

    # call to determine whether the current transaction sender is the creator
    is_creator = Txn.sender() == Global.creator_address()

    # value of whether or not the sender can vote ("yes", "no", or "maybe")
    get_sender_can_vote = App.localGetEx(Int(0), App.id(), Bytes("can_vote"))

    # get_vote_sender is a value that the sender voted for,
    #   a number indicating the index in the VoteOptions string faux-array.
    # Remember that since we stored the election's voting options as a string separated by commas (such as "A,B,C,D"),
    # If a user wants to vote for C, then the choice that the user wants to vote for is equivalent to the uint 2
    get_vote_of_sender = App.localGetEx(Int(0), App.id(), Bytes("voted"))

    sender_can_vote_update = App.localGetEx(
        Txn.application_args[1], App.id(), Bytes("can_vote")
    )

    on_closeout = Seq(
        # TODO: CLOSE OUT:
        [
            get_vote_of_sender,
            # if statement
            If(
                And(
                    Global.round() <= App.globalGet(Bytes("ElectionEnd")),
                    get_vote_of_sender.hasValue(),  # alr voted so must be included > invariant
                ),
                App.globalPut(
                    Concat(Bytes("VotesFor"), itoa(get_vote_of_sender.value())),
                    App.globalGet(
                        Concat(Bytes("VotesFor"), itoa(get_vote_of_sender.value()))
                    )
                    - Int(1),
                ),
            ),
            Return(Int(1)),
        ]
    )

    on_register = Seq(
        [
            Assert(Global.round() <= App.globalGet(Bytes("ElectionEnd"))),
            App.localPut(
                Int(0), Bytes("can_vote"), Bytes("maybe")
            ),  # CHECK Int(0) or Txn.sender()??
            Return(Int(1)),
        ]
    )

    on_update_user_status = Seq(  # CHECK sender_can_vote_update
        [
            # get_sender_can_vote,
            sender_can_vote_update,
            Assert(
                And(
                    Global.round() <= App.globalGet(Bytes("ElectionEnd")),
                    is_creator,
                    sender_can_vote_update.hasValue(),  # if it doesn't not registered
                    sender_can_vote_update.value() != Bytes("yes"),
                    sender_can_vote_update.value() != Bytes("no"),  # else alr updated
                )
            ),
            App.localPut(
                Txn.application_args[1], Bytes("can_vote"), Txn.application_args[2]
            ),
            Return(Int(1)),
        ]
    )

    choice = itoa(Btoi(Txn.application_args[1]))
    choiceInt = Btoi(Txn.application_args[1])
    choice_tally = App.globalGet(Concat(Bytes("VotesFor"), choice))
    on_vote = Seq(
        [
            get_sender_can_vote,
            Assert(
                And(
                    Global.round() <= App.globalGet(Bytes("ElectionEnd")),
                    get_sender_can_vote.hasValue(),
                    get_sender_can_vote.value() == Bytes("yes"),
                )
            ),
            get_vote_of_sender,
            If(get_vote_of_sender.hasValue(), Return(Int(0))),
            Assert(
                And(
                    choiceInt >= Int(0),
                    choiceInt < App.globalGet(Bytes("NumVoteOptions")),
                )
            ),
            App.globalPut(Concat(Bytes("VotesFor"), choice), choice_tally + Int(1)),
            App.localPut(
                Int(0), Bytes("voted"), choiceInt
            ),  # Int(0) refers to present sender address
            Return(Int(1)),
        ],
    )

    program = Cond(
        # MAIN CONDITIONAL
        [Txn.application_id() == Int(0), on_creation],
        [Txn.on_completion() == OnComplete.DeleteApplication, Return(is_creator)],
        [Txn.on_completion() == OnComplete.UpdateApplication, Return(is_creator)],
        [Txn.on_completion() == OnComplete.CloseOut, on_closeout],
        [Txn.on_completion() == OnComplete.OptIn, on_register],
        [Txn.application_args[0] == Bytes("vote"), on_vote],
        [
            Txn.application_args[0] == Bytes("update_user_status"),
            on_update_user_status,
        ]  # CHECK!
        # TODO: Complete the cases that will trigger the update_user_status and on_vote sequences
    )

    return program


def clear_state_program():
    """Handles the logic of when an account clears its participation in a smart contract."""

    # TODO: CLEAR STATE PROGRAM

    get_vote_of_sender = App.localGetEx(Int(0), App.id(), Bytes("voted"))

    program = Seq(
        # remove their vote from the correct vote tally
        [
            get_vote_of_sender,
            # if statement
            If(
                And(
                    Global.round() <= App.globalGet(Bytes("ElectionEnd")),
                    get_vote_of_sender.hasValue(),  # alr voted so must be included > invariant
                ),
                App.globalPut(
                    Concat(Bytes("VotesFor"), itoa(get_vote_of_sender.value())),
                    App.globalGet(
                        Concat(Bytes("VotesFor"), itoa(get_vote_of_sender.value()))
                    )
                    - Int(1),
                ),
            ),
            Return(Int(1)),
        ]
    )

    return program


if __name__ == "__main__":

    with open("vote_approval.teal", "w") as f:
        compiled = compileTeal(approval_program(), mode=Mode.Application, version=5)
        f.write(compiled)

    with open("vote_clear_state.teal", "w") as f:
        compiled = compileTeal(clear_state_program(), mode=Mode.Application, version=5)
        f.write(compiled)
