import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { addTodo, deleteTodo, getTodos, setTodoDone, Todo, WebKey } from '../db';
import { color, font, size } from '../theme';
import { Pill } from '../ui';

// The to-do panel along the bottom of a web (spec section 4a): "To-dos ·
// <web title>", a "+ Add" button and checkable items, each showing the
// bubble it is linked to. Lists the web's own to-dos plus any linked to a
// bubble shown in it (see getTodos in src/db.ts). Long-press an item to
// delete it.

export type LinkChoice = { id: string; title: string };

export default function TodoPanel({ webKey, webTitle, bubbles, defaultLinkId }: {
  webKey: WebKey;
  webTitle: string;
  bubbles: LinkChoice[];        // what a new to-do can be linked to: centre first
  defaultLinkId: string | null; // preselected link for a new to-do
}) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1);
  const [adding, setAdding] = useState(false);

  const todos = getTodos(webKey);
  const open = todos.filter(t => !t.done).length;

  function toggle(t: Todo) {
    setTodoDone(t.id, !t.done);
    refresh();
  }

  function confirmDelete(t: Todo) {
    Alert.alert('Delete this to-do?', t.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteTodo(t.id); refresh(); } },
    ]);
  }

  return (
    <View style={st.panel}>
      <View style={st.head}>
        <Text style={st.heading} numberOfLines={1} accessibilityRole="header">
          {'TO-DOS \u00b7 ' + webTitle.toUpperCase()}
        </Text>
        {!adding && <Pill label="+ Add" onPress={() => setAdding(true)} accessibilityLabel="Add a to-do" />}
      </View>

      {adding && (
        <AddForm
          bubbles={bubbles}
          defaultLinkId={defaultLinkId}
          onCancel={() => setAdding(false)}
          onSave={(text, linkId) => {
            addTodo(webKey, text, linkId);
            setAdding(false);
            refresh();
          }}
        />
      )}

      {!adding && (todos.length ? (
        <ScrollView style={st.list} accessibilityLabel={open + ' open to-dos'}>
          {todos.map(t => (
            <Item key={t.id} todo={t} onToggle={() => toggle(t)} onLongPress={() => confirmDelete(t)} />
          ))}
        </ScrollView>
      ) : (
        <Text style={st.empty}>Nothing to do here yet.</Text>
      ))}
    </View>
  );
}

function Item({ todo, onToggle, onLongPress }: { todo: Todo; onToggle: () => void; onLongPress: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: todo.done }}
      accessibilityLabel={todo.text + (todo.concept_title ? ', ' + todo.concept_title : '')}
      accessibilityHint="Long-press to delete"
      style={st.item}
    >
      <View style={[st.box, todo.done && st.boxDone]}>
        {todo.done && (
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path d="M2.5 7.5 L5.6 10.4 L11.5 3.8" stroke={color.panel} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      <View style={st.itemText}>
        <Text style={[st.text, todo.done && st.textDone]}>{todo.text}</Text>
        {!!todo.concept_title && <Text style={st.link} numberOfLines={1}>{todo.concept_title}</Text>}
      </View>
    </Pressable>
  );
}

function AddForm({ bubbles, defaultLinkId, onSave, onCancel }: {
  bubbles: LinkChoice[];
  defaultLinkId: string | null;
  onSave: (text: string, linkId: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [linkId, setLinkId] = useState<string | null>(defaultLinkId);
  const trimmed = text.trim();
  const save = () => { if (trimmed) onSave(trimmed, linkId); };
  const choices: { id: string | null; title: string }[] = [{ id: null, title: 'None' }, ...bubbles];

  return (
    <View style={st.form}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What needs doing?"
        placeholderTextColor={color.fadedBorder}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        style={st.input}
        accessibilityLabel="New to-do"
      />
      <Text style={st.formLabel}>LINKED BUBBLE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} keyboardShouldPersistTaps="handled">
        {choices.map(b => (
          <Pill
            key={b.id ?? 'none'}
            label={b.title}
            selected={linkId === b.id}
            onPress={() => setLinkId(b.id)}
            accessibilityLabel={'Link to ' + b.title}
          />
        ))}
      </ScrollView>
      <View style={st.formButtons}>
        <Pill label="Cancel" onPress={onCancel} />
        <Pill label="Add to-do" onPress={save} selected disabled={!trimmed} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: {
    backgroundColor: color.panel,
    borderTopWidth: 1.5,
    borderColor: color.ink,
    paddingHorizontal: size.pad,
    paddingTop: 14,
    paddingBottom: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  heading: { flex: 1, fontFamily: font.uiMedium, fontSize: 13, letterSpacing: 1.4, color: color.faint },
  list: { maxHeight: 232 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: color.divider,
  },
  box: {
    width: 26, height: 26, borderRadius: 5, borderWidth: 2, borderColor: color.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  boxDone: { backgroundColor: color.ink },
  itemText: { flex: 1 },
  text: { fontFamily: font.ui, fontSize: 17, color: color.ink, lineHeight: 23 },
  textDone: { textDecorationLine: 'line-through', color: color.faint },
  link: { fontFamily: font.ui, fontSize: 14, color: color.faint, marginTop: 2 },
  empty: { fontFamily: font.ui, fontSize: size.small, color: color.faint, paddingVertical: 14 },
  form: { paddingTop: 6, paddingBottom: 8, gap: 10 },
  input: {
    borderWidth: 1.5, borderColor: color.ink, borderRadius: 6, paddingHorizontal: 12, minHeight: 48,
    fontFamily: font.ui, fontSize: 17, color: color.ink, backgroundColor: color.panel,
  },
  formLabel: { fontFamily: font.uiMedium, fontSize: 13, letterSpacing: 1.4, color: color.faint },
  chips: { gap: 8, paddingRight: 8 },
  formButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
